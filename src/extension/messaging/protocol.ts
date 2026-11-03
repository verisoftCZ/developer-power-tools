import { isRecord, validateRecipe } from '../../core/recipes/schema';
export interface Message {
  protocolVersion: 1;
  requestId: string;
  type: string;
  payload: Record<string, unknown>;
}
const commands = new Set([
  'ready',
  'runRecipe',
  'cancelRun',
  'loadSelection',
  'replaceSelection',
  'saveRecipe',
  'loadRecipes',
  'copyOutput',
  'importRecipe',
  'exportRecipe',
]);
export function validateMessage(raw: unknown, maxBytes: number): Message {
  if (
    !isRecord(raw) ||
    raw.protocolVersion !== 1 ||
    typeof raw.requestId !== 'string' ||
    !/^[\w-]{1,128}$/.test(raw.requestId) ||
    typeof raw.type !== 'string' ||
    !commands.has(raw.type) ||
    !isRecord(raw.payload)
  )
    throw new Error('Invalid protocol message.');
  const p = raw.payload;
  if (raw.type === 'runRecipe') {
    validateRecipe(p.recipe);
    if (typeof p.input !== 'string' || Buffer.byteLength(p.input) > maxBytes)
      throw new Error('Input exceeds the configured limit or is not text.');
  }
  if (['saveRecipe', 'exportRecipe'].includes(raw.type)) validateRecipe(p.recipe);
  return raw as unknown as Message;
}
