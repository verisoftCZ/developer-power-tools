import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkerRunner } from '../../src/core/engine/runner';
import { Recipe, textValue } from '../../src/core/types';
const recipe: Recipe = {
  schemaVersion: 1,
  id: 'worker',
  name: 'Worker test',
  steps: [{ id: 'decode', operationId: 'base64.decode', enabled: true, params: {} }],
};
test('real worker transfers bytes and reports steps', async () => {
  const runner = new WorkerRunner(path.resolve('dist/worker.cjs'));
  let progress = 0;
  const result = await runner.run(recipe, textValue('AP8='), 1024, 10000, () => progress++);
  assert.equal(result.output.kind, 'bytes');
  assert.deepEqual(Array.from(result.output.value as Uint8Array), [0, 255]);
  assert.equal(progress, 1);
  runner.cancel();
});
test('cancellation terminates worker and next run succeeds', async () => {
  const runner = new WorkerRunner(path.resolve('dist/worker.cjs'));
  const pending = runner.run(recipe, textValue('YQ=='), 1024, 10000);
  const check = assert.rejects(pending, /Cancelled/);
  const before = performance.now();
  runner.cancel();
  await check;
  assert.ok(performance.now() - before < 500);
  assert.equal((await runner.run(recipe, textValue('YQ=='), 1024, 10000)).output.kind, 'bytes');
});
test('deadline kills worker; newer run supersedes prior run', async () => {
  const runner = new WorkerRunner(path.resolve('dist/worker.cjs'));
  await assert.rejects(runner.run(recipe, textValue('YQ=='), 1024, 1), /terminated/);
  const old = runner.run(recipe, textValue('YQ=='), 1024, 10000);
  const rejected = assert.rejects(old, /Cancelled/);
  await runner.run(recipe, textValue('Yg=='), 1024, 10000);
  await rejected;
});
test('cancels a worker during synchronous CPU-bound execution, then runs again', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'powertools-worker-'));
  const file = path.join(folder, 'spin.cjs');
  writeFileSync(
    file,
    `const {parentPort}=require('node:worker_threads');parentPort.on('message',({input})=>{if(input.value==='spin'){parentPort.postMessage({type:'step',step:{stepId:'spinning',durationMs:0,kind:'text',size:0}});while(true){Math.sqrt(12345);}}else parentPort.postMessage({type:'result',result:{output:input,steps:[],durationMs:0}});});`,
  );
  const runner = new WorkerRunner(file);
  let began = 0;
  try {
    const pending = runner.run(recipe, textValue('spin'), 1024, 10000, () => {
      began = performance.now();
      runner.cancel();
    });
    await assert.rejects(pending, /Cancelled/);
    assert.ok(began > 0);
    assert.ok(performance.now() - began < 500);
    assert.equal((await runner.run(recipe, textValue('next'), 1024, 10000)).output.value, 'next');
  } finally {
    runner.cancel();
    rmSync(folder, { recursive: true, force: true });
  }
});
