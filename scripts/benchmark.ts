import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../src/core/engine/execute';
import { WorkerRunner } from '../src/core/engine/runner';
import { Recipe, textValue } from '../src/core/types';
async function main() {
  const recipe: Recipe = {
    schemaVersion: 1,
    id: 'bench',
    name: '1 MiB decode',
    steps: [{ id: 'decode', operationId: 'base64.decode', enabled: true, params: {} }],
  };
  const input = textValue(Buffer.alloc(1024 * 1024, 65).toString('base64'));
  const direct: number[] = [],
    worker: number[] = [];
  const runner = new WorkerRunner(path.resolve('dist/worker.cjs'));
  for (let i = 0; i < 25; i++) {
    let start = performance.now();
    execute(recipe, input, 10 * 1024 * 1024);
    direct.push(performance.now() - start);
    start = performance.now();
    await runner.run(recipe, input, 10 * 1024 * 1024, 10000);
    worker.push(performance.now() - start);
  }
  const pending = runner.run(recipe, input, 10 * 1024 * 1024, 10000);
  const handled = pending.catch(() => {});
  const before = performance.now();
  runner.cancel();
  await handled;
  const cancelMs = performance.now() - before;
  const stats = (samples: number[]) => {
    samples.sort((a, b) => a - b);
    return { p50Ms: samples[12], p95Ms: samples[23] };
  };
  const report = {
    date: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    cpu: os.cpus()[0].model,
    decodedBytes: 1024 * 1024,
    samples: 25,
    native: stats(direct),
    workerIncludingStartup: stats(worker),
    cancelThroughTerminationMs: cancelMs,
    rssBytes: process.memoryUsage().rss,
    notes: 'RSS is a snapshot, not high-water mark. Panel rendering not measured.',
  };
  writeFileSync('docs/benchmark.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
void main();
