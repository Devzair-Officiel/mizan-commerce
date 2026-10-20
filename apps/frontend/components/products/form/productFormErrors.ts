import type { FieldErrors } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
import { ROW_FIELDS, type FormatRow, type ProductFormValues, type RowField } from './productFormSchema';

/** Champ du formulaire qui peut porter une erreur, dans l'ordre d'affichage. */
export type ProductFieldPath = 'name' | 'unit' | 'description' | `formats.${number}.${RowField}`;

/** Clé du message affiché pour une erreur renvoyée par le serveur (`articles.form`). */
type ServerMessage = 'name_taken' | 'format_name_taken' | 'sku_taken' | 'field_invalid';

/** Premier champ en erreur après la validation du schéma : informations (nom, unité, description), formats ligne par ligne. */
export function firstError(errors: FieldErrors<ProductFormValues>): ProductFieldPath | undefined {
  if (errors.name) return 'name';
  if (errors.unit) return 'unit';
  if (errors.description) return 'description';
  const rows: (FieldErrors<FormatRow> | undefined)[] = Array.isArray(errors.formats) ? errors.formats : [];
  for (const [i, row] of rows.entries()) {
    const field = row && ROW_FIELDS.find((f) => row[f]);
    if (field) return `formats.${i}.${field}`;
  }
  return undefined;
}

/**
 * Champs en erreur renvoyés par l'API (`{detail, errors: {name, variants: {"0": {packaging_name}}}}`),
 * dans l'ordre d'affichage. Une erreur sans champ (format déjà servi…) n'y figure pas.
 */
export function serverErrors(err: unknown): { path: ProductFieldPath; message: ServerMessage }[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const errors = (err.data as { errors?: Record<string, unknown> } | null)?.errors;
  if (!errors || typeof errors !== 'object') return [];
  const found: { path: ProductFieldPath; message: ServerMessage }[] = [];
  if ('name' in errors) found.push({ path: 'name', message: 'name_taken' });
  if ('description' in errors) found.push({ path: 'description', message: 'field_invalid' });
  const rows = errors.variants;
  if (rows && typeof rows === 'object' && !Array.isArray(rows)) {
    const sorted = Object.entries(rows as Record<string, Record<string, unknown>>).sort(([a], [b]) => Number(a) - Number(b));
    for (const [i, row] of sorted) {
      for (const field of ROW_FIELDS) {
        if (!((field === 'name' ? 'packaging_name' : field) in row)) continue;
        const message = field === 'name' ? 'format_name_taken' : field === 'sku' ? 'sku_taken' : 'field_invalid';
        found.push({ path: `formats.${Number(i)}.${field}`, message });
      }
    }
  }
  return found;
}
