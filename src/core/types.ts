export type DataValue =
  | { kind: 'text'; value: string; encoding: 'utf-8' }
  | { kind: 'bytes'; value: Uint8Array }
  | { kind: 'json'; value: unknown };
export type Kind = DataValue['kind'];
export interface Parameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
}
export interface OperationDefinition {
  id: string;
  version: string;
  displayName: string;
  category: string;
  description: string;
  inputKinds: Kind[];
  outputKind: Kind;
  parameters: Parameter[];
}
export interface RecipeStep {
  id: string;
  operationId: string;
  enabled: boolean;
  params: Record<string, unknown>;
}
export interface Recipe {
  schemaVersion: 1;
  id: string;
  name: string;
  steps: RecipeStep[];
}
export interface StepResult {
  stepId: string;
  durationMs: number;
  kind: Kind;
  size: number;
}
export interface RunResult {
  output: DataValue;
  steps: StepResult[];
  durationMs: number;
}
export const textValue = (value: string): DataValue => ({ kind: 'text', value, encoding: 'utf-8' });
export function valueSize(data: DataValue): number {
  return data.kind === 'bytes'
    ? data.value.byteLength
    : Buffer.byteLength(data.kind === 'text' ? data.value : JSON.stringify(data.value), 'utf8');
}
export function outputText(data: DataValue): string {
  if (data.kind === 'bytes')
    throw new Error('Binary output: add Bytes → Text or To Hex before copying or replacing text.');
  return data.kind === 'text' ? data.value : JSON.stringify(data.value, null, 2);
}
