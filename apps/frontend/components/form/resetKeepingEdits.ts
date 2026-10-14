import type { FieldPath, FieldValues, PathValue, UseFormReturn } from 'react-hook-form';

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

/** Chemins (`a.b`) des champs dont la valeur `current` diffère de `base`. */
function changedPaths(base: unknown, current: unknown, path = ''): string[] {
  if (isFields(base) && isFields(current)) {
    return Object.keys(current).flatMap((key) => changedPaths(base[key], current[key], join(path, key)));
  }
  return JSON.stringify(base) === JSON.stringify(current) ? [] : [path];
}

/** Chemins de tous les champs (un tableau compte pour un seul champ). */
function fieldPaths(values: unknown, path = ''): string[] {
  if (!isFields(values)) return [path];
  return Object.entries(values).flatMap(([key, value]) => fieldPaths(value, join(path, key)));
}

/**
 * Remet le formulaire aux valeurs du serveur (`next`), sauf les champs que l'utilisateur a modifiés :
 * ils gardent leur saisie et restent marqués comme non enregistrés.
 * - après un enregistrement, `submitted` (les valeurs envoyées) : seuls les champs changés depuis,
 *   pendant la requête, sont gardés ;
 * - sans `submitted` (données du serveur rechargées) : les champs non enregistrés sont gardés.
 */
export function resetKeepingEdits<T extends FieldValues>(form: UseFormReturn<T>, next: T, submitted?: T) {
  const current = form.getValues();
  // `getFieldState` lit l'état à jour ; `formState` est celui du dernier rendu.
  const kept = submitted
    ? changedPaths(submitted, current)
    : fieldPaths(current).filter((path) => form.getFieldState(path as FieldPath<T>).isDirty);
  const values = kept.map((path) => [path, form.getValues(path as FieldPath<T>)] as const);
  form.reset(next);
  for (const [path, value] of values) {
    form.setValue(path as FieldPath<T>, value as PathValue<T, FieldPath<T>>, { shouldDirty: true });
  }
}
