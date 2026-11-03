import { parseDocument, stringify } from 'yaml';

function jsonCompatible(value: unknown, maxBytes: number): unknown {
  let count = 0,
    used = 0;
  const active = new Set<object>();
  const budget = (bytes: number) => {
    used += bytes;
    if (used > maxBytes) throw new Error('Converted YAML/JSON exceeds the output size limit.');
  };
  function visit(value: unknown, depth: number): unknown {
    if (++count > 100000 || depth > 64)
      throw new Error('YAML/JSON conversion exceeds 100,000 values or 64 levels.');
    budget(2);
    if (typeof value === 'bigint') {
      if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
        throw new Error(
          'YAML integer cannot be represented exactly as a JSON number. Quote it to preserve it as text.',
        );
      value = Number(value);
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('YAML non-finite numbers cannot be represented in JSON.');
      budget(new TextEncoder().encode(JSON.stringify(value)).byteLength);
      return value;
    }
    if (
      !value ||
      typeof value !== 'object' ||
      (!Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    )
      throw new Error('Unsupported YAML type; only JSON-compatible values are allowed.');
    if (active.has(value)) throw new Error('Cyclic YAML aliases cannot be represented in JSON.');
    active.add(value);
    const result = Array.isArray(value) ? [] : {};
    for (const [key, child] of Object.entries(value)) {
      budget(new TextEncoder().encode(JSON.stringify(key)).byteLength + 1);
      Object.defineProperty(result, key, {
        value: visit(child, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    active.delete(value);
    return result;
  }
  return visit(value, 0);
}
export function yamlToJson(source: string, maxBytes: number): unknown {
  const document = parseDocument(source, {
    version: '1.2',
    schema: 'core',
    resolveKnownTags: false,
    customTags: [],
    merge: false,
    uniqueKeys: true,
    stringKeys: true,
    intAsBigInt: true,
    logLevel: 'error',
  });
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem) throw new Error(`Invalid or unsupported YAML: ${problem.message}`);
  if (document.directives?.yaml.version !== '1.2') throw new Error('Only YAML 1.2 is supported.');
  return jsonCompatible(document.toJS({ maxAliasCount: 50 }), maxBytes);
}
export function jsonToYaml(value: unknown, indent: number, maxBytes: number): string {
  return stringify(jsonCompatible(value, maxBytes), {
    version: '1.2',
    schema: 'core',
    indent,
    lineWidth: 0,
    aliasDuplicateObjects: false,
  });
}
