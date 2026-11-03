import { Recipe } from '../types';
export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function short(v: unknown, max = 128): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}
export function validateRecipe(value: unknown): Recipe {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !short(value.id) ||
    !short(value.name) ||
    !Array.isArray(value.steps) ||
    value.steps.length > 100
  )
    throw new Error('Invalid recipe: expected schemaVersion 1, id, name and at most 100 steps.');
  const ids = new Set<string>();
  for (const step of value.steps) {
    if (
      !isRecord(step) ||
      !short(step.id) ||
      !short(step.operationId) ||
      typeof step.enabled !== 'boolean' ||
      !isRecord(step.params) ||
      JSON.stringify(step.params).length > 16384 ||
      ids.has(step.id)
    )
      throw new Error('Invalid recipe step or duplicate step id.');
    ids.add(step.id);
    for (const [key, v] of Object.entries(step.params))
      if (
        key.length > 128 ||
        !['string', 'number', 'boolean'].includes(typeof v) ||
        (typeof v === 'number' && !Number.isFinite(v))
      )
        throw new Error('Parameters must be finite numbers, strings or booleans.');
  }
  // Persist only the portable recipe contract; imported incidental input/metadata is discarded.
  return {
    schemaVersion: 1,
    id: value.id,
    name: value.name,
    steps: value.steps.map((step) => ({
      id: step.id,
      operationId: step.operationId,
      enabled: step.enabled,
      params: structuredClone(step.params),
    })),
  };
}
