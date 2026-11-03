import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { DataValue, Kind, OperationDefinition, Parameter, textValue } from '../types';
import { decodeJsonFields, escapeJsonFields } from './json-fields';
import { convertDate } from './dates';
import { yamlToJson, jsonToYaml } from './yaml';

const choice = (key: string, label: string, options: string[], value = options[0]): Parameter => ({
  key,
  label,
  type: 'select',
  default: value,
  options,
});
const bool = (key: string, label: string, value = false): Parameter => ({
  key,
  label,
  type: 'boolean',
  default: value,
});
interface Operation extends OperationDefinition {
  run: (input: DataValue, params: Record<string, unknown>, maxBytes: number) => DataValue;
}
const ops: Operation[] = [];
function add(
  id: string,
  displayName: string,
  category: string,
  inputKinds: Kind[],
  outputKind: Kind,
  description: string,
  parameters: Parameter[],
  run: Operation['run'],
) {
  ops.push({
    id,
    version: '1.0.0',
    displayName,
    category,
    inputKinds,
    outputKind,
    description,
    parameters,
    run,
  });
}
function str(d: DataValue): string {
  if (d.kind !== 'text') throw new Error('Expected text.');
  return d.value;
}
function bytes(d: DataValue): Uint8Array {
  if (d.kind !== 'bytes') throw new Error('Expected bytes. Add Text → Bytes first.');
  return d.value;
}
function json(d: DataValue): unknown {
  if (d.kind !== 'json') throw new Error('Expected JSON. Add JSON Parse first.');
  return d.value;
}
function decode64(source: string, alphabet: unknown, strict: unknown): Uint8Array {
  let s = source;
  if (!strict) s = s.replace(/\s/g, '');
  const pattern = alphabet === 'url' ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
  if (!pattern.test(s) || s.length % 4 === 1 || (s.includes('=') && s.length % 4 !== 0))
    throw new Error('Invalid Base64 alphabet, length or padding.');
  const out = Buffer.from(s, alphabet === 'url' ? 'base64url' : 'base64');
  if (
    out.toString(alphabet === 'url' ? 'base64url' : 'base64').replace(/=+$/, '') !==
    s.replace(/=+$/, '')
  )
    throw new Error('Non-canonical Base64 trailing bits.');
  return out;
}
export function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (error) {
    const msg = (error as Error).message;
    const position = /position (\d+)/.exec(msg);
    const before = s.slice(0, position ? Number(position[1]) : jsonErrorOffset(s));
    throw new Error(
      `Invalid JSON at line ${before.split('\n').length}, column ${before.length - before.lastIndexOf('\n')}: ${msg}`,
    );
  }
}
// V8 sometimes omits offsets. This diagnostic scanner only runs after JSON.parse fails.
function jsonErrorOffset(source: string): number {
  let i = 0;
  const fail = (): never => {
    throw i;
  };
  const whitespace = () => {
    while (/[\x20\t\r\n]/.test(source[i] ?? '!')) i++;
  };
  function string(): void {
    if (source[i++] !== '"') fail();
    while (i < source.length) {
      const c = source[i++];
      if (c === '"') return;
      if (c < ' ') {
        i--;
        fail();
      }
      if (c === '\\') {
        const escape = source[i++];
        if (escape === 'u') {
          for (let n = 0; n < 4; n++) {
            if (!/[0-9a-f]/i.test(source[i] ?? '!')) fail();
            i++;
          }
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) {
          i--;
          fail();
        }
      }
    }
    fail();
  }
  function value(depth: number): void {
    whitespace();
    if (depth > 512) fail();
    const c = source[i];
    if (c === '"') string();
    else if (c === '{' || c === '[') {
      const object = c === '{',
        end = object ? '}' : ']';
      i++;
      whitespace();
      if (source[i] === end) {
        i++;
        return;
      }
      while (i < source.length) {
        if (object) {
          string();
          whitespace();
          if (source[i] !== ':') fail();
          i++;
        }
        value(depth + 1);
        whitespace();
        if (source[i] === end) {
          i++;
          return;
        }
        if (source[i] !== ',') fail();
        i++;
        whitespace();
      }
      fail();
    } else if (c === 't' || c === 'f' || c === 'n') {
      const token = c === 't' ? 'true' : c === 'f' ? 'false' : 'null';
      for (const ch of token) {
        if (source[i] !== ch) fail();
        i++;
      }
    } else {
      const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      if (!number) fail();
      i += number![0].length;
    }
  }
  try {
    value(0);
    whitespace();
    return i;
  } catch {
    return Math.min(i, source.length);
  }
}
add(
  'text.bytes',
  'Text → Bytes',
  'Conversion',
  ['text'],
  'bytes',
  'Encode text as UTF-8 bytes.',
  [],
  (d) => ({ kind: 'bytes', value: Buffer.from(str(d), 'utf8') }),
);
add(
  'bytes.text',
  'Bytes → Text',
  'Conversion',
  ['bytes'],
  'text',
  'Decode UTF-8. Invalid sequences fail by default.',
  [bool('lossy', 'Allow replacement characters')],
  (d, p) => textValue(new TextDecoder('utf-8', { fatal: !p.lossy }).decode(bytes(d))),
);
add(
  'base64.decode',
  'From Base64',
  'Encoding',
  ['text'],
  'bytes',
  'Decode to raw bytes; use Bytes → Text for UTF-8.',
  [
    choice('alphabet', 'Alphabet', ['standard', 'url']),
    bool('strict', 'Strict (reject whitespace)', true),
  ],
  (d, p) => ({ kind: 'bytes', value: decode64(str(d), p.alphabet, p.strict) }),
);
add(
  'base64.encode',
  'To Base64',
  'Encoding',
  ['bytes'],
  'text',
  'Encode raw bytes without changing them.',
  [choice('alphabet', 'Alphabet', ['standard', 'url'])],
  (d, p) =>
    textValue(Buffer.from(bytes(d)).toString(p.alphabet === 'url' ? 'base64url' : 'base64')),
);
add(
  'base64.text',
  'Base64 → Text',
  'Encoding',
  ['text'],
  'text',
  'Decode Base64 directly to strict UTF-8 text.',
  [
    choice('alphabet', 'Alphabet', ['standard', 'url']),
    bool('strict', 'Strict (reject whitespace)', true),
  ],
  (d, p) =>
    textValue(
      new TextDecoder('utf-8', { fatal: true }).decode(decode64(str(d), p.alphabet, p.strict)),
    ),
);
add(
  'text.base64',
  'Text → Base64',
  'Encoding',
  ['text'],
  'text',
  'Encode UTF-8 text directly as Base64.',
  [choice('alphabet', 'Alphabet', ['standard', 'url'])],
  (d, p) =>
    textValue(Buffer.from(str(d), 'utf8').toString(p.alphabet === 'url' ? 'base64url' : 'base64')),
);
add(
  'hex.decode',
  'From Hex',
  'Encoding',
  ['text'],
  'bytes',
  'Accept pairs of hex digits with optional whitespace.',
  [],
  (d) => {
    const s = str(d).replace(/\s/g, '');
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(s))
      throw new Error('Hex requires complete pairs of hexadecimal digits.');
    return { kind: 'bytes', value: Buffer.from(s, 'hex') };
  },
);
add(
  'hex.encode',
  'To Hex',
  'Encoding',
  ['bytes'],
  'text',
  'Show raw bytes as hexadecimal.',
  [bool('uppercase', 'Uppercase')],
  (d, p) => {
    const s = Buffer.from(bytes(d)).toString('hex');
    return textValue(p.uppercase ? s.toUpperCase() : s);
  },
);
add(
  'json.parse',
  'JSON Parse',
  'JSON',
  ['text'],
  'json',
  'Parse a JSON document with syntax errors and location.',
  [],
  (d) => ({ kind: 'json', value: parseJson(str(d)) }),
);
add(
  'json.unescape',
  'JSON Unescape',
  'JSON',
  ['text'],
  'text',
  'Decode one layer of JSON string escapes, with or without surrounding quotes. Add JSON Parse to inspect the decoded document.',
  [choice('format', 'Input format', ['auto', 'quoted string', 'string contents'])],
  (d, p) => {
    const source = str(d);
    const quoted =
      p.format === 'quoted string' || (p.format === 'auto' && source.trimStart().startsWith('"'));
    const decoded = parseJson(quoted ? source : `"${source}"`);
    if (typeof decoded !== 'string')
      throw new Error('JSON Unescape expects a JSON string, not an object, array or scalar.');
    return textValue(decoded);
  },
);
add(
  'json.pretty',
  'JSON Pretty Print',
  'JSON',
  ['json'],
  'text',
  'Format parsed JSON as readable text.',
  [choice('indent', 'Indent', ['2', '4', 'tab'])],
  (d, p) => textValue(JSON.stringify(json(d), null, p.indent === 'tab' ? '\t' : Number(p.indent))),
);
add(
  'json.minify',
  'JSON Minify',
  'JSON',
  ['json'],
  'text',
  'Serialize parsed JSON without whitespace.',
  [],
  (d) => textValue(JSON.stringify(json(d))),
);
add(
  'json.decodeFields',
  'Decode Escaped JSON Fields',
  'JSON',
  ['text', 'json'],
  'json',
  'JSON with escaped JSON → JSON. Decode object/array strings recursively; preserve ordinary values and existing objects.',
  [{ key: 'depth', label: 'Maximum depth', type: 'number', default: 32, min: 1, max: 64 }],
  (d, p) => ({
    kind: 'json',
    value: decodeJsonFields(
      d.kind === 'text' ? parseJson(d.value) : json(d),
      Number(p.depth),
      parseJson,
    ),
  }),
);
add(
  'json.escape',
  'JSON → Escaped JSON',
  'JSON',
  ['text', 'json'],
  'text',
  'Escape the whole JSON document as a string, or stringify selected object/array fields while keeping the outer object.',
  [
    choice('mode', 'Mode', ['whole document', 'selected fields']),
    {
      key: 'paths',
      label: 'JSON Pointers, comma separated',
      type: 'string',
      default: '/Metadata, /Data',
    },
  ],
  (d, p) => {
    const value = d.kind === 'text' ? parseJson(d.value) : json(d);
    return textValue(
      p.mode === 'selected fields'
        ? JSON.stringify(escapeJsonFields(value, String(p.paths)), null, 2)
        : JSON.stringify(JSON.stringify(value)),
    );
  },
);
add(
  'json.nested',
  'Parse Nested JSON',
  'JSON',
  ['json'],
  'json',
  'Parse a string at a JSON Pointer, or recursively parse JSON-looking strings. Atomic on errors.',
  [
    choice('mode', 'Mode', ['path', 'recursive']),
    {
      key: 'path',
      label: 'JSON Pointer (e.g. /user/data; empty = root)',
      type: 'string',
      default: '',
    },
    { key: 'depth', label: 'Maximum depth', type: 'number', default: 8, min: 1, max: 32 },
  ],
  (d, p) => {
    const root = structuredClone(json(d));
    const depth = Number(p.depth);
    let visited = 0;
    function walk(v: unknown, level: number, path: string): unknown {
      if (++visited > 100000) throw new Error('Nested JSON traversal exceeds 100,000 values.');
      if (level > depth) return v;
      if (typeof v === 'string' && /^[\s]*[\[{"]/.test(v))
        return walk(parseJson(v), level + 1, path);
      if (v && typeof v === 'object')
        for (const k of Object.keys(v)) {
          Object.defineProperty(v, k, {
            value: walk((v as Record<string, unknown>)[k], level + 1, `${path}/${k}`),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
      return v;
    }
    if (p.mode === 'recursive') return { kind: 'json', value: walk(root, 0, '') };
    const pointer = String(p.path);
    if (pointer === '') {
      if (typeof root !== 'string')
        throw new Error('Root is not a JSON string. Choose a JSON Pointer.');
      return { kind: 'json', value: parseJson(root) };
    }
    if (!pointer.startsWith('/') || /~(?![01])/.test(pointer))
      throw new Error('Use an RFC 6901 JSON Pointer beginning with /.');
    const keys = pointer
      .slice(1)
      .split('/')
      .map((x) => x.replace(/~1/g, '/').replace(/~0/g, '~'));
    let parent: unknown = root;
    for (const key of keys.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key))
        throw new Error(`Path not found: ${pointer}`);
      parent = (parent as Record<string, unknown>)[key];
    }
    const key = keys[keys.length - 1];
    if (
      !parent ||
      typeof parent !== 'object' ||
      !Object.hasOwn(parent, key) ||
      typeof (parent as Record<string, unknown>)[key] !== 'string'
    )
      throw new Error('Selected path must contain a JSON string.');
    Object.defineProperty(parent, key, {
      value: parseJson((parent as Record<string, string>)[key]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return { kind: 'json', value: root };
  },
);
for (const decode of [false, true])
  add(
    `url.${decode ? 'decode' : 'encode'}`,
    decode ? 'URL Decode' : 'URL Encode',
    'Encoding',
    ['text'],
    'text',
    'Choose component or whole URL semantics.',
    [choice('mode', 'Mode', ['component', 'whole'])],
    (d, p) =>
      textValue(
        (decode
          ? p.mode === 'whole'
            ? decodeURI
            : decodeURIComponent
          : p.mode === 'whole'
            ? encodeURI
            : encodeURIComponent)(str(d)),
      ),
  );
add(
  'jwt.inspect',
  'JWT Inspect',
  'Inspection',
  ['text'],
  'json',
  'Decode a JWT, optionally prefixed with Bearer. Signature is NOT verified.',
  [],
  (d) => {
    const token = str(d)
      .trim()
      .replace(/^Bearer[ \t]+/i, '')
      .trim();
    const parts = token.split('.');
    if (parts.length !== 3 || /\s/.test(token) || !/^[A-Za-z0-9_-]*$/.test(parts[2]))
      throw new Error('Expected three JWT segments, optionally prefixed with Bearer.');
    return {
      kind: 'json',
      value: {
        header: parseJson(
          new TextDecoder('utf-8', { fatal: true }).decode(decode64(parts[0], 'url', true)),
        ),
        payload: parseJson(
          new TextDecoder('utf-8', { fatal: true }).decode(decode64(parts[1], 'url', true)),
        ),
        signatureVerified: false,
        warning: 'Signature NOT verified; do not trust these claims.',
      },
    };
  },
);
add(
  'yaml.json',
  'YAML → JSON',
  'Conversion',
  ['text'],
  'json',
  'Parse a single YAML 1.2 document into JSON. Reject unsupported tags, cycles and excessive alias expansion.',
  [],
  (d, _p, max) => ({ kind: 'json', value: yamlToJson(str(d), max) }),
);
add(
  'json.yaml',
  'JSON → YAML',
  'Conversion',
  ['text', 'json'],
  'text',
  'Convert pasted or parsed JSON to YAML 1.2. Data values are preserved; comments and source formatting are not.',
  [choice('indent', 'Indent', ['2', '4'])],
  (d, p, max) =>
    textValue(jsonToYaml(d.kind === 'text' ? parseJson(d.value) : json(d), Number(p.indent), max)),
);
add(
  'gzip.compress',
  'Gzip Compress',
  'Compression',
  ['bytes'],
  'bytes',
  'Compress bytes using gzip.',
  [],
  (d) => ({ kind: 'bytes', value: gzipSync(bytes(d)) }),
);
add(
  'gzip.decompress',
  'Gzip Decompress',
  'Compression',
  ['bytes'],
  'bytes',
  'Decompress with a strict maximum output size.',
  [],
  (d, _p, max) => ({ kind: 'bytes', value: gunzipSync(bytes(d), { maxOutputLength: max }) }),
);
add(
  'hash.sha256',
  'SHA-256',
  'Inspection',
  ['bytes'],
  'text',
  'Cryptographic hash of raw bytes. This is not encryption.',
  [],
  (d) => textValue(createHash('sha256').update(bytes(d)).digest('hex')),
);
add(
  'guid.generate',
  'Generate GUID',
  'Generation',
  ['text', 'json', 'bytes'],
  'text',
  'Generate cryptographically random UUID v4 values. Ignores input; every run generates new values.',
  [
    { key: 'count', label: 'Count', type: 'number', default: 1, min: 1, max: 1000 },
    bool('uppercase', 'Uppercase'),
    bool('braces', 'Surround with braces'),
  ],
  (_d, p) =>
    textValue(
      Array.from({ length: Number(p.count) }, () => {
        const id = randomUUID();
        const value = p.uppercase ? id.toUpperCase() : id;
        return p.braces ? `{${value}}` : value;
      }).join('\n'),
    ),
);
add(
  'date.convert',
  'Date → UTC / Timezone',
  'Conversion',
  ['text'],
  'text',
  'Detect or specify a date. Output defaults to Europe/Prague in Czech format (dd.MM.yyyy HH:mm:ss). Unzoned input defaults to UTC.',
  [
    choice('format', 'Input format', [
      'auto',
      'ISO 8601',
      'dd.MM.yyyy',
      'dd/MM/yyyy',
      'MM/dd/yyyy',
      'yyyy-MM-dd',
      'unix seconds',
      'unix milliseconds',
      'custom',
    ]),
    { key: 'customFormat', label: 'Custom format', type: 'string', default: 'dd.MM.yyyy HH:mm:ss' },
    { key: 'sourceZone', label: 'Source timezone (if no offset)', type: 'string', default: 'UTC' },
    { key: 'outputZone', label: 'Output timezone', type: 'string', default: 'Europe/Prague' },
    choice('outputFormat', 'Output format', ['Czech', 'ISO 8601']),
    choice('ambiguity', 'Repeated DST time', ['reject', 'earlier', 'later']),
  ],
  (d, p) => textValue(convertDate(str(d), p)),
);
add(
  'time.unix',
  'Unix Timestamp',
  'Inspection',
  ['text'],
  'json',
  'Convert a Unix timestamp to an explicit timezone.',
  [
    choice('unit', 'Unit', ['seconds', 'milliseconds']),
    {
      key: 'timezone',
      label: 'Timezone (IANA, e.g. UTC or Europe/Prague)',
      type: 'string',
      default: 'UTC',
    },
  ],
  (d, p) => {
    const s = str(d).trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(s)) throw new Error('Expected a numeric timestamp.');
    const date = new Date(Number(s) * (p.unit === 'seconds' ? 1000 : 1));
    return {
      kind: 'json',
      value: {
        iso: date.toISOString(),
        timezone: p.timezone,
        formatted: new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: String(p.timezone),
        }).format(date),
      },
    };
  },
);
export const definitions: OperationDefinition[] = ops.map(({ run, ...definition }) => definition);
export function executeOperation(
  id: string,
  input: DataValue,
  raw: Record<string, unknown>,
  maxBytes: number,
): DataValue {
  const op = ops.find((x) => x.id === id);
  if (!op) throw new Error(`Unsupported operation: ${id}`);
  if (!op.inputKinds.includes(input.kind))
    throw new Error(
      `${op.displayName} accepts ${op.inputKinds.join('/')} but received ${input.kind}. Add an explicit conversion.`,
    );
  const p: Record<string, unknown> = {};
  for (const key of Object.keys(raw))
    if (!op.parameters.some((x) => x.key === key)) throw new Error(`Unknown parameter: ${key}`);
  for (const param of op.parameters) {
    const v = raw[param.key] ?? param.default;
    if (
      (param.type === 'boolean' && typeof v !== 'boolean') ||
      (param.type === 'number' &&
        (typeof v !== 'number' ||
          !Number.isFinite(v) ||
          !Number.isInteger(v) ||
          v < (param.min ?? -Infinity) ||
          v > (param.max ?? Infinity))) ||
      ((param.type === 'string' || param.type === 'select') &&
        (typeof v !== 'string' || v.length > 4096)) ||
      (param.options && !param.options.includes(v as string))
    )
      throw new Error(`Invalid parameter: ${param.label}`);
    p[param.key] = v;
  }
  return op.run(input, p, maxBytes);
}
