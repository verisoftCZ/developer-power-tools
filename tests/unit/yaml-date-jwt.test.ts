import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeOperation as operation, definitions } from '../../src/core/operations/registry';
import { textValue, DataValue } from '../../src/core/types';
const op = (
  id: string,
  input: string | DataValue,
  params: Record<string, unknown> = {},
  max = 1024 * 1024,
) => operation(id, typeof input === 'string' ? textValue(input) : input, params, max);
test('date output defaults to Prague and Czech date/time, with seasonal offsets', () => {
  assert.equal(op('date.convert', '2025-08-19T10:00:00Z').value, '19.08.2025 12:00:00');
  assert.equal(op('date.convert', '2025-01-19T10:00:00Z').value, '19.01.2025 11:00:00');
  assert.equal(op('date.convert', '2025-08-19T10:00:00.123Z').value, '19.08.2025 12:00:00.123');
  assert.equal(
    op('date.convert', '19.08.2025 12:00', { sourceZone: 'Europe/Prague' }).value,
    '19.08.2025 12:00:00',
  );
  const defaults = Object.fromEntries(
    definitions.find((d) => d.id === 'date.convert')!.parameters.map((p) => [p.key, p.default]),
  );
  assert.equal(defaults.outputZone, 'Europe/Prague');
  assert.equal(defaults.outputFormat, 'Czech');
  assert.equal(defaults.sourceZone, 'UTC');
});
test('ISO and UTC remain explicitly selectable independent of Czech formatting', () => {
  assert.equal(
    op('date.convert', '2025-08-19T10:00:00Z', { outputFormat: 'ISO 8601' }).value,
    '2025-08-19T12:00:00.000+02:00',
  );
  assert.equal(
    op('date.convert', '2025-08-19T10:00:00Z', { outputZone: 'UTC', outputFormat: 'ISO 8601' })
      .value,
    '2025-08-19T10:00:00.000Z',
  );
  assert.equal(
    op('date.convert', '2025-08-19T10:00:00Z', { outputZone: 'UTC' }).value,
    '19.08.2025 10:00:00',
  );
});
const sample = {
  name: 'Žofie 🌍',
  enabled: true,
  values: [1, null, false],
  text: 'line one\nline two',
  numericString: '001234',
  date: '2025-08-19',
};
test('JSON/YAML conversion preserves Unicode, strings, types, arrays and multiline values', () => {
  for (const input of [JSON.stringify(sample), { kind: 'json' as const, value: sample }])
    for (const indent of ['2', '4'])
      assert.deepEqual(op('yaml.json', op('json.yaml', input, { indent })).value, sample);
  assert.deepEqual(op('yaml.json', 'name: Žofie\nvalues:\n  - 1\n  - true\n  - null\n').value, {
    name: 'Žofie',
    values: [1, true, null],
  });
  assert.equal(op('yaml.json', '').value, null);
  assert.equal(op('yaml.json', 'yes').value, 'yes');
});
test('YAML errors and unsupported types cannot silently lose data', () => {
  for (const yaml of [
    'a: [1',
    'a: 1\na: 2',
    '---\na: 1\n---\nb: 2',
    'a: !custom value',
    'a: !!timestamp 2025-08-19',
    'a: .inf',
    'a: .nan',
    'a: 9007199254740993',
    '? [a, b]\n: value',
    '%YAML 1.1\n---\na: yes',
  ])
    assert.throws(() => op('yaml.json', yaml), yaml);
});
test('YAML aliases are bounded, cycles are rejected, and normal shared values work', () => {
  assert.deepEqual(op('yaml.json', 'a: &data {x: 1}\nb: *data').value, {
    a: { x: 1 },
    b: { x: 1 },
  });
  assert.throws(() => op('yaml.json', 'a: &data [*data]'), /alias|cyclic/i);
  const yaml =
    'a: &a [one, two, three]\nb: &b [*a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b]\nd: [*c, *c, *c, *c, *c]';
  assert.throws(() => op('yaml.json', yaml), /alias|resource/i);
  assert.throws(() => op('yaml.json', 'a: long long string', {}, 10), /size/);
  assert.throws(() => op('yaml.json', '['.repeat(70) + '1' + ']'.repeat(70)), /levels/);
});
test('YAML prototype-like keys remain inert own properties', () => {
  const value = op('yaml.json', '__proto__: {polluted: true}\nconstructor: value').value as any;
  assert.ok(Object.hasOwn(value, '__proto__'));
  assert.equal(value.__proto__.polluted, true);
  assert.equal(({} as any).polluted, undefined);
});
test('JWT inspection accepts bare tokens and case-insensitive Bearer prefixes', () => {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${part({ alg: 'none' })}.${part({ sub: 'example' })}.`;
  const bare = op('jwt.inspect', token);
  for (const input of [`Bearer ${token}`, `  bearer   ${token} \n`, `BEARER\t${token}`])
    assert.deepEqual(op('jwt.inspect', input), bare);
  assert.equal((bare.value as any).signatureVerified, false);
  for (const input of ['Bearer', 'Bearer x.y', 'Bearer ' + token + ' extra', 'Bearer\n' + token])
    assert.throws(() => op('jwt.inspect', input));
});
