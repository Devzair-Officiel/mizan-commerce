import { ApiError } from '@/lib/api-client';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Index des lignes dont `field` est refusé par l'API : `{errors: {lines: [{}, {quantity: [...]}]}}`. */
export function rejectedLines(error: unknown, field: string): number[] {
  if (!(error instanceof ApiError) || error.status !== 400 || !isRecord(error.data)) return [];
  const errors = error.data.errors;
  const lines = isRecord(errors) ? errors.lines : undefined;
  if (!Array.isArray(lines)) return [];
  return lines.flatMap((line: unknown, index) => (isRecord(line) && field in line ? [index] : []));
}
