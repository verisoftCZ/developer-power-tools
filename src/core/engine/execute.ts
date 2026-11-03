import { performance } from 'node:perf_hooks';
import { DataValue, Recipe, RunResult, StepResult, valueSize } from '../types';
import { executeOperation } from '../operations/registry';
import { validateRecipe } from '../recipes/schema';
export function execute(
  recipe: Recipe,
  input: DataValue,
  maxBytes: number,
  onStep?: (step: StepResult) => void,
): RunResult {
  recipe = validateRecipe(recipe);
  let output = input;
  const steps: StepResult[] = [];
  const start = performance.now();
  if (valueSize(input) > maxBytes) throw new Error('Input exceeds the configured size limit.');
  for (const step of recipe.steps) {
    if (!step.enabled) continue;
    const before = performance.now();
    try {
      output = executeOperation(step.operationId, output, step.params, maxBytes);
      const size = valueSize(output);
      if (size > maxBytes) throw new Error('Output exceeds the configured size limit.');
      const result = {
        stepId: step.id,
        durationMs: performance.now() - before,
        kind: output.kind,
        size,
      };
      steps.push(result);
      onStep?.(result);
    } catch (error) {
      throw Object.assign(new Error((error as Error).message), { stepId: step.id });
    }
  }
  return { output, steps, durationMs: performance.now() - start };
}
