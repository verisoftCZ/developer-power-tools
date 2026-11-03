import { parentPort } from 'node:worker_threads';
import { execute } from '../engine/execute';
parentPort!.on('message', ({ recipe, input, maxBytes }) => {
  try {
    const result = execute(recipe, input, maxBytes, (step) =>
      parentPort!.postMessage({ type: 'step', step }),
    );
    const transfer =
      result.output.kind === 'bytes' ? [Uint8Array.from(result.output.value).buffer] : [];
    if (result.output.kind === 'bytes') result.output.value = new Uint8Array(transfer[0]);
    parentPort!.postMessage({ type: 'result', result }, transfer);
  } catch (error) {
    parentPort!.postMessage({
      type: 'error',
      message: (error as Error).message,
      stepId: (error as { stepId?: string }).stepId,
    });
  }
});
