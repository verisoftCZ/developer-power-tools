import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRecipe } from '../../src/core/recipes/schema';
import { execute } from '../../src/core/engine/execute';
import { textValue } from '../../src/core/types';

test('published example recipes validate and execute with synthetic input', () => {
  const cases = [
    ['base64-json', Buffer.from('{"hello":"world"}').toString('base64'), { hello: 'world' }],
    ['escaped-fields', '{"data":"{\\"hello\\":\\"world\\"}"}', { data: { hello: 'world' } }],
    ['yaml-json', 'hello: world', { hello: 'world' }],
  ] as const;
  for (const [name, input, expected] of cases) {
    const recipe = validateRecipe(JSON.parse(readFileSync(`examples/${name}.recipe.json`, 'utf8')));
    const output = execute(recipe, textValue(input), 1024 * 1024).output;
    assert.deepEqual(output.kind === 'text' ? JSON.parse(output.value) : output.value, expected);
  }
});
