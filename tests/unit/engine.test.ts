import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { executeOperation as op, definitions } from '../../src/core/operations/registry';
import { execute } from '../../src/core/engine/execute';
import { validateRecipe } from '../../src/core/recipes/schema';
import { validateMessage } from '../../src/extension/messaging/protocol';
import { DataValue, Recipe, textValue as t } from '../../src/core/types';
const max = 1024 * 1024;
const b = (v: number[]): DataValue => ({ kind: 'bytes', value: Uint8Array.from(v) });
const j = (value: unknown): DataValue => ({ kind: 'json', value });
const recipe = (...ids: string[]): Recipe => ({
  schemaVersion: 1,
  id: 'test',
  name: 'Test',
  steps: ids.map((operationId, i) => ({ id: `s${i}`, operationId, enabled: true, params: {} })),
});
test('valid Base64 → UTF-8', () =>
  assert.deepEqual(
    op('bytes.text', op('base64.decode', t('SGVsbG8g8J+MjQ=='), {}, max), {}, max),
    t('Hello 🌍'),
  ));
test('all 256 byte values survive Base64 and hex roundtrip', () => {
  const input = b(Array.from({ length: 256 }, (_, i) => i));
  for (const format of ['base64', 'hex'])
    assert.deepEqual(
      Array.from(
        (
          op(`${format}.decode`, op(`${format}.encode`, input, {}, max), {}, max) as {
            value: Uint8Array;
          }
        ).value,
      ),
      Array.from((input as { value: Uint8Array }).value),
    );
});
for (const invalid of ['A', 'A===', '@@@=', 'Zh==', 'Zg=', 'Z g=='])
  test(`reject invalid Base64 ${invalid}`, () =>
    assert.throws(() => op('base64.decode', t(invalid), {}, max)));
test('lenient Base64 accepts whitespace; URL alphabet is explicit', () => {
  assert.equal(
    (op('base64.decode', t(' Zg==\n'), { strict: false }, max).value as Uint8Array)[0],
    102,
  );
  assert.deepEqual(
    Array.from(op('base64.decode', t('-_8'), { alphabet: 'url' }, max).value as Uint8Array),
    [251, 255],
  );
});
test('UTF-8 errors cannot silently corrupt bytes', () => {
  assert.throws(() => op('bytes.text', b([255]), {}, max));
  assert.equal(op('bytes.text', b([255]), { lossy: true }, max).value, '�');
});
test('explicit kind mismatch errors', () =>
  assert.throws(() => op('base64.encode', t('hello'), {}, max), /explicit conversion/));
test('JSON pretty and minify preserve semantics', () => {
  const input = op('json.parse', t('{"a": [1,true,null]}'), {}, max);
  for (const id of ['json.pretty', 'json.minify'])
    assert.deepEqual(JSON.parse(op(id, input, {}, max).value as string), input.value);
});
test('JSON errors report a location', () =>
  assert.throws(() => op('json.parse', t('{"x":\n@}'), {}, max), /line 2/));
test('JSON Unescape decodes quoted strings and bare escaped JSON contents', () => {
  const decoded = '{"message":"Hello 🌍","path":"C:\\temp"}';
  const quoted = JSON.stringify(decoded);
  for (const source of [quoted, quoted.slice(1, -1)])
    assert.deepEqual(op('json.unescape', t(source), {}, max), t(decoded));
  assert.deepEqual(op('json.unescape', t(` \n${quoted}\t`), {}, max), t(decoded));
});
test('JSON Unescape handles every JSON escape and Unicode in a single pass', () => {
  assert.deepEqual(
    op('json.unescape', t(String.raw`\"\\\/\b\f\n\r\t\u0041\uD83C\uDF0D`), {}, max),
    t('"\\/\b\f\n\r\tA🌍'),
  );
  assert.deepEqual(op('json.unescape', t(String.raw`\\n`), {}, max), t(String.raw`\n`));
});
test('JSON Unescape handles empty and plain contents without trimming them', () => {
  for (const source of ['', '  hello  ', '""'])
    assert.deepEqual(op('json.unescape', t(source), {}, max), t(source === '""' ? '' : source));
  assert.deepEqual(op('json.unescape', t('"hello"'), { format: 'quoted string' }, max), t('hello'));
  assert.deepEqual(
    op('json.unescape', t(String.raw`\"hello\"`), { format: 'string contents' }, max),
    t('"hello"'),
  );
});
test('JSON Unescape rejects malformed escapes, raw control characters and non-string JSON', () => {
  for (const source of [
    String.raw`\x41`,
    String.raw`\uXYZ1`,
    'trailing\\',
    '"unterminated',
    'raw\nnewline',
    String.raw`{"raw":"quotes"}`,
  ])
    assert.throws(() => op('json.unescape', t(source), {}, max), /Invalid JSON/);
  for (const source of ['{}', '[]', '42', 'null', 'true'])
    assert.throws(
      () => op('json.unescape', t(source), { format: 'quoted string' }, max),
      /expects a JSON string/,
    );
});
test('JSON Unescape chains explicitly into JSON Parse and reports step errors', () => {
  assert.deepEqual(
    execute(recipe('json.unescape', 'json.parse'), t(String.raw`{\"id\":42}`), max).output,
    j({ id: 42 }),
  );
  assert.throws(
    () => execute(recipe('json.unescape'), t(String.raw`\q`), max),
    (error: any) => error.stepId === 's0',
  );
});
test('nested JSON parses only selected pointer and escaped pointer keys', () => {
  const input = j({ 'a/b': { '~key': '{"x":1}' }, keep: '{"y":2}' });
  assert.deepEqual(op('json.nested', input, { path: '/a~1b/~0key' }, max).value, {
    'a/b': { '~key': { x: 1 } },
    keep: '{"y":2}',
  });
  assert.equal((input.value as any)['a/b']['~key'], '{"x":1}');
});
test('nested JSON malformed value fails atomically', () => {
  const input = j({ a: '{"x":1}', b: '{bad' });
  assert.throws(() => op('json.nested', input, { mode: 'recursive' }, max));
  assert.equal((input.value as any).a, '{"x":1}');
});
test('nested JSON own-property handling prevents prototype pollution', () => {
  const input = op('json.parse', t('{"__proto__":"{\\"safe\\":true}"}'), {}, max);
  const out = op('json.nested', input, { path: '/__proto__' }, max);
  assert.equal(({} as any).safe, undefined);
  assert.equal(Object.hasOwn(out.value as object, '__proto__'), true);
  assert.throws(() => op('json.nested', j({}), { path: '/constructor' }, max));
});
test('nested root strings and bounded depth', () => {
  assert.deepEqual(op('json.nested', j('{"a":1}'), {}, max).value, { a: 1 });
  assert.deepEqual(
    op('json.nested', j({ a: { b: '{"c":1}' } }), { mode: 'recursive', depth: 1 }, max).value,
    { a: { b: '{"c":1}' } },
  );
});
test('URL component and whole URL roundtrips', () => {
  for (const mode of ['whole', 'component']) {
    const input = t('https://example.test/a b?q=č');
    assert.deepEqual(
      op('url.decode', op('url.encode', input, { mode }, max), { mode }, max),
      input,
    );
  }
  assert.throws(() => op('url.decode', t('%XX'), {}, max));
});
test('invalid hex fails', () => {
  for (const s of ['1', '0z', '0x12']) assert.throws(() => op('hex.decode', t(s), {}, max));
});
test('JWT inspection explicitly reports unverified signature', () => {
  const encode = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const out = op('jwt.inspect', t(`${encode({ alg: 'none' })}.${encode({ sub: '42' })}.`), {}, max);
  assert.equal((out.value as any).signatureVerified, false);
  assert.throws(() => op('jwt.inspect', t('x.y'), {}, max));
});
test('gzip binary roundtrip and bomb limit', () => {
  const input = b([0, 255, 1, 2, 3]);
  assert.deepEqual(
    Array.from(
      op('gzip.decompress', op('gzip.compress', input, {}, max), {}, max).value as Uint8Array,
    ),
    [0, 255, 1, 2, 3],
  );
  assert.throws(() =>
    op('gzip.decompress', { kind: 'bytes', value: gzipSync(Buffer.alloc(20000)) }, {}, 1000),
  );
});
test('SHA-256 golden vector', () =>
  assert.equal(
    op('hash.sha256', b([]), {}, max).value,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  ));
test('timestamp explicit units and timezone', () => {
  assert.equal((op('time.unix', t('0'), {}, max).value as any).iso, '1970-01-01T00:00:00.000Z');
  assert.equal(
    (
      op('time.unix', t('1000'), { unit: 'milliseconds', timezone: 'Europe/Prague' }, max)
        .value as any
    ).timezone,
    'Europe/Prague',
  );
  assert.throws(() => op('time.unix', t(''), {}, max));
});
test('recipe executes in order, supports disable, reports failing step', () => {
  const r = recipe('text.bytes', 'base64.encode');
  assert.equal(execute(r, t('hello'), max).output.value, 'aGVsbG8=');
  r.steps[1].enabled = false;
  assert.equal(execute(r, t('hello'), max).output.kind, 'bytes');
  r.steps.reverse();
  r.steps[0].enabled = true;
  assert.throws(
    () => execute(r, t('hello'), max),
    (e: any) => e.stepId === 's1',
  );
});
test('empty recipe and input are identity', () =>
  assert.deepEqual(execute(recipe(), t(''), max).output, t('')));
test('limits apply to inputs and intermediate values', () => {
  assert.throws(() => execute(recipe(), t('abc'), 2), /Input/);
  assert.throws(() => execute(recipe('text.bytes', 'hex.encode'), t('abc'), 4), /Output/);
});
test('unknown operations survive validation but cannot execute', () => {
  const r = recipe('future.operation');
  assert.deepEqual(validateRecipe(r), r);
  assert.throws(() => execute(r, t(''), max), /Unsupported/);
  r.steps[0].enabled = false;
  assert.equal(execute(r, t(''), max).output.value, '');
});
test('schema rejects versions, duplicate IDs and complex parameters', () => {
  assert.throws(() => validateRecipe({ ...recipe(), schemaVersion: 2 }));
  const r = recipe('json.parse', 'json.parse');
  r.steps[1].id = r.steps[0].id;
  assert.throws(() => validateRecipe(r));
  assert.throws(() =>
    validateRecipe({
      ...recipe(),
      steps: [{ id: 'x', operationId: 'x', enabled: true, params: { x: {} } }],
    }),
  );
});
test('parameter validation rejects wrong types, unknown keys and excessive bounds', () => {
  assert.throws(() => op('json.nested', j({}), { depth: 999 }, max));
  assert.throws(() => op('base64.decode', t(''), { strict: 'true' }, max));
  assert.throws(() => op('json.parse', t('{}'), { code: 'evil' }, max));
});
test('protocol rejects malformed, oversized and unknown messages', () => {
  const msg = {
    protocolVersion: 1,
    requestId: 'run-1',
    type: 'runRecipe',
    payload: { recipe: recipe(), input: 'abc' },
  };
  assert.equal(validateMessage(msg, max).type, 'runRecipe');
  for (const bad of [
    null,
    {},
    { ...msg, protocolVersion: 2 },
    { ...msg, type: 'eval' },
    { ...msg, requestId: '<script>' },
    { ...msg, payload: { input: 3 } },
  ])
    assert.throws(() => validateMessage(bad, max));
  assert.throws(() => validateMessage(msg, 2));
});
test('every registered operation has a unique stable id and version', () => {
  assert.equal(new Set(definitions.map((x) => x.id)).size, definitions.length);
  assert.ok(definitions.every((x) => x.version === '1.0.0'));
});
test('recipe roundtrip preserves settings and strips incidental input fields', () => {
  const r = recipe('base64.decode');
  r.steps[0].params = { strict: false, alphabet: 'url' };
  r.steps[0].enabled = false;
  assert.deepEqual(
    validateRecipe(
      JSON.parse(JSON.stringify({ ...r, input: 'must not persist', output: 'secret' })),
    ),
    r,
  );
});
