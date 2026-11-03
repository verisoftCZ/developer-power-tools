import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeOperation as operation } from '../../src/core/operations/registry';
import { textValue, DataValue } from '../../src/core/types';
const max = 1024 * 1024;
const op = (id: string, value: string | DataValue, params: Record<string, unknown> = {}) =>
  operation(
    id,
    typeof value === 'string' ? textValue(value) : value,
    id === 'date.convert' ? { outputZone: 'UTC', outputFormat: 'ISO 8601', ...params } : params,
    max,
  );
const mixed = {
  Metadata: JSON.stringify({ OsobniUdaje: {} }),
  SomeOtherNotEscapedData: { x: 'value' },
  Data: JSON.stringify({
    OsobniUdaje: {
      name: 'Žofie',
      date: '19.08.2025',
      identifier: '001234',
      enabled: false,
      address: { city: 'Česká Lípa' },
      items: [{ value: 3 }],
    },
  }),
};
test('one-step Base64 text operations roundtrip Unicode, multiline and empty input', () => {
  for (const source of ['', 'Hello\nŽluťoučký 🌍', 'null'])
    for (const alphabet of ['standard', 'url'])
      assert.deepEqual(
        op('base64.text', op('text.base64', source, { alphabet }), { alphabet }),
        textValue(source),
      );
  assert.equal(op('text.base64', 'hello').value, 'aGVsbG8=');
  assert.throws(() => op('base64.text', '/w=='), /encoded data|encoding/i);
  assert.throws(() => op('base64.text', '@@'));
  assert.equal(op('base64.text', ' YQ==\n', { strict: false }).value, 'a');
});
test('mixed escaped JSON becomes objects while existing data and scalar types survive', () => {
  const expected = {
    Metadata: { OsobniUdaje: {} },
    SomeOtherNotEscapedData: { x: 'value' },
    Data: JSON.parse(mixed.Data),
  };
  for (const source of [JSON.stringify(mixed), { kind: 'json' as const, value: mixed }])
    assert.deepEqual(op('json.decodeFields', source).value, expected);
  assert.equal(typeof mixed.Metadata, 'string');
  assert.equal((expected.Data as any).OsobniUdaje.identifier, '001234');
});
test('escaped JSON traversal handles arrays and further encoded fields without coercing scalars', () => {
  const input = {
    items: [
      JSON.stringify({
        payload: JSON.stringify([1, true, null]),
        plain: '2025-08-19',
        count: '123',
        flag: 'true',
        quote: '"hello"',
      }),
    ],
  };
  assert.deepEqual(op('json.decodeFields', JSON.stringify(input)).value, {
    items: [
      {
        payload: [1, true, null],
        plain: '2025-08-19',
        count: '123',
        flag: 'true',
        quote: '"hello"',
      },
    ],
  });
});
test('escaped JSON errors are atomic and identify the field; recursion limits fail explicitly', () => {
  const input = { good: '{"ok":true}', bad: '{invalid' };
  assert.throws(
    () => op('json.decodeFields', { kind: 'json', value: input }),
    /Invalid escaped JSON at \/bad/,
  );
  assert.equal(input.good, '{"ok":true}');
  assert.throws(() => op('json.decodeFields', '{"a":{"b":"{}"}}', { depth: 1 }), /depth limit/);
  assert.throws(() => op('json.decodeFields', 'bad'), /Invalid JSON/);
});
test('escaped JSON traversal preserves own prototype-like keys safely', () => {
  const out = op('json.decodeFields', '{"__proto__":"{\\"safe\\":true}","constructor":"[]"}')
    .value as any;
  assert.equal(({} as any).safe, undefined);
  assert.ok(Object.hasOwn(out, '__proto__'));
  assert.deepEqual(out.__proto__, { safe: true });
  assert.deepEqual(out.constructor, []);
});
test('whole JSON escaping is reversed by JSON Unescape then JSON Parse', () => {
  const input = { name: 'Žofie', text: 'line\n"quoted"\\path', values: [1, null, true] };
  const encoded = op('json.escape', JSON.stringify(input));
  assert.equal(typeof encoded.value, 'string');
  assert.deepEqual(op('json.parse', op('json.unescape', encoded)).value, input);
});
test('selected JSON field escaping reverses the requested mixed-object workflow', () => {
  const decoded = op('json.decodeFields', JSON.stringify(mixed));
  const encoded = op('json.escape', decoded, {
    mode: 'selected fields',
    paths: '/Metadata, /Data',
  });
  assert.deepEqual(JSON.parse(encoded.value as string), mixed);
  assert.deepEqual(op('json.decodeFields', encoded), decoded);
  const special = { kind: 'json' as const, value: { 'a/b': { '~c': { x: 1 } }, keep: { a: 1 } } };
  assert.deepEqual(
    JSON.parse(
      op('json.escape', special, { mode: 'selected fields', paths: '/a~1b/~0c' }).value as string,
    ),
    { 'a/b': { '~c': '{"x":1}' }, keep: { a: 1 } },
  );
});
test('selected field escaping rejects missing, inherited, overlapping and scalar pointers', () => {
  for (const paths of ['', '/missing', '/constructor', '/a,/a/b', '/a,/a', '/scalar', '/bad~3key'])
    assert.throws(() =>
      op('json.escape', '{"a":{"b":{}},"scalar":1}', { mode: 'selected fields', paths }),
    );
});
test('GUID generation emits UUID v4 with bounded count and optional formatting', () => {
  const value = op('guid.generate', 'ignored', { count: 100 }).value as string;
  const ids = value.split('\n');
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100);
  assert.ok(
    ids.every((id) =>
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id),
    ),
  );
  assert.match(
    op('guid.generate', '', { uppercase: true, braces: true }).value as string,
    /^\{[A-F0-9]{8}-[A-F0-9]{4}-4[A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}\}$/,
  );
  assert.throws(() => op('guid.generate', '', { count: 1001 }));
});
test('dates auto-detect ISO, Czech dates, offsets and timestamps with explicit UTC/ISO output', () => {
  for (const source of [
    '19.08.2025',
    '2025-08-19',
    '2025-08-19T00:00:00Z',
    '2025-08-19T02:00:00+02:00',
  ])
    assert.equal(op('date.convert', source).value, '2025-08-19T00:00:00.000Z');
  assert.equal(op('date.convert', '2025-08-19T02:00:00.12+0200').value, '2025-08-19T00:00:00.120Z');
  assert.equal(op('date.convert', '1700000000').value, '2023-11-14T22:13:20.000Z');
  assert.equal(op('date.convert', '1700000000123').value, '2023-11-14T22:13:20.123Z');
  assert.equal(
    op('date.convert', '0', { format: 'unix seconds' }).value,
    '1970-01-01T00:00:00.000Z',
  );
});
test('date formats can be selected or customized without host-locale parsing', () => {
  assert.equal(
    op('date.convert', '03/04/2025', { format: 'dd/MM/yyyy' }).value,
    '2025-04-03T00:00:00.000Z',
  );
  assert.equal(
    op('date.convert', '03/04/2025', { format: 'MM/dd/yyyy' }).value,
    '2025-03-04T00:00:00.000Z',
  );
  assert.equal(op('date.convert', '19/08/2025 12:30:45.123').value, '2025-08-19T12:30:45.123Z');
  assert.equal(op('date.convert', '08/19/2025').value, '2025-08-19T00:00:00.000Z');
  assert.equal(
    op('date.convert', '2025/08/19 12-30-45.123', {
      format: 'custom',
      customFormat: 'yyyy/MM/dd HH-mm-ss.SSS',
    }).value,
    '2025-08-19T12:30:45.123Z',
  );
  assert.throws(() => op('date.convert', '03/04/2025'), /Ambiguous/);
  assert.throws(() => op('date.convert', '19.08.2025', { format: 'MM/dd/yyyy' }), /match/);
});
test('date source and output zones are independent, with seasonal offsets', () => {
  assert.equal(
    op('date.convert', '19.08.2025 12:00', { sourceZone: 'Europe/Prague' }).value,
    '2025-08-19T10:00:00.000Z',
  );
  assert.equal(
    op('date.convert', '19.01.2025 12:00', { sourceZone: 'Europe/Prague' }).value,
    '2025-01-19T11:00:00.000Z',
  );
  assert.equal(
    op('date.convert', '2025-08-19T10:00:00Z', { outputZone: 'Europe/Prague' }).value,
    '2025-08-19T12:00:00.000+02:00',
  );
  assert.equal(
    op('date.convert', '2025-08-19T10:00:00Z', { outputZone: 'Asia/Kathmandu' }).value,
    '2025-08-19T15:45:00.000+05:45',
  );
  assert.equal(
    op('date.convert', '2025-08-19T10:00:00-05:00', { sourceZone: 'Europe/Prague' }).value,
    '2025-08-19T15:00:00.000Z',
  );
});
test('DST gaps and repeated times require explicit valid choices', () => {
  assert.throws(
    () => op('date.convert', '2025-03-30T02:30', { sourceZone: 'Europe/Prague' }),
    /does not exist/,
  );
  assert.throws(
    () => op('date.convert', '2025-10-26T02:30', { sourceZone: 'Europe/Prague' }),
    /ambiguous/,
  );
  assert.equal(
    op('date.convert', '2025-10-26T02:30', { sourceZone: 'Europe/Prague', ambiguity: 'earlier' })
      .value,
    '2025-10-26T00:30:00.000Z',
  );
  assert.equal(
    op('date.convert', '2025-10-26T02:30', { sourceZone: 'Europe/Prague', ambiguity: 'later' })
      .value,
    '2025-10-26T01:30:00.000Z',
  );
});
test('invalid dates, offsets, format tokens and zones fail instead of silently rolling over', () => {
  for (const source of [
    '',
    'not a date',
    '31.02.2025',
    '2025-02-29',
    '2025-08-19T25:00',
    '2025-13-01',
    '2025-08-19T00:00+25:00',
  ])
    assert.throws(() => op('date.convert', source));
  assert.equal(op('date.convert', '2024-02-29').value, '2024-02-29T00:00:00.000Z');
  assert.throws(
    () => op('date.convert', '2025-08-19', { outputZone: 'Not/AZone' }),
    /Invalid timezone/,
  );
  assert.throws(
    () => op('date.convert', '2025-08-19', { sourceZone: 'Not/AZone' }),
    /Invalid timezone/,
  );
  assert.throws(
    () => op('date.convert', '2025', { format: 'custom', customFormat: 'yyyy yyyy' }),
    /Duplicate/,
  );
  assert.throws(
    () => op('date.convert', '2025', { format: 'custom', customFormat: 'yyyy Q' }),
    /support/,
  );
  assert.throws(
    () => op('date.convert', '9999999999999999999999', { format: 'unix milliseconds' }),
    /range/,
  );
});
