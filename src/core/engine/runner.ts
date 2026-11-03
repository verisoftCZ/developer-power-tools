import { Worker } from 'node:worker_threads';
import { DataValue, Recipe, RunResult, StepResult } from '../types';
export class WorkerRunner {
  private active?: { worker: Worker; fail: (error: Error) => void };
  constructor(private workerPath: string) {}
  cancel(): void {
    if (this.active) this.active.fail(new Error('Cancelled.'));
  }
  async run(
    recipe: Recipe,
    input: DataValue,
    maxBytes: number,
    timeoutMs: number,
    onStep?: (step: StepResult) => void,
  ): Promise<RunResult> {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        resourceLimits: {
          maxOldGenerationSizeMb: 256,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
      });
      let done = false;
      const finish = (error?: Error, result?: RunResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (this.active?.worker === worker) this.active = undefined;
        void worker.terminate().then(() => {
          error ? reject(error) : resolve(result!);
        }, reject);
      };
      const timer = setTimeout(
        () => finish(new Error(`Execution exceeded ${timeoutMs} ms and was terminated.`)),
        timeoutMs,
      );
      this.active = { worker, fail: (error) => finish(error) };
      worker.on('message', (message) => {
        if (message.type === 'step') onStep?.(message.step);
        else if (message.type === 'result') finish(undefined, message.result);
        else finish(Object.assign(new Error(message.message), { stepId: message.stepId }));
      });
      worker.on('error', (error) => finish(error));
      worker.on('exit', (code) => {
        if (!done) finish(new Error(`Worker exited unexpectedly (${code}).`));
      });
      if (input.kind === 'bytes') {
        const value = Uint8Array.from(input.value);
        worker.postMessage({ recipe, input: { ...input, value }, maxBytes }, [value.buffer]);
      } else worker.postMessage({ recipe, input, maxBytes });
    });
  }
}
