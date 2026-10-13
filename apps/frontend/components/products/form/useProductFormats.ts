'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { emptyRow, type ProductFormValues } from './productFormSchema';

/** Ligne dont la fenêtre « Référence et code-barres » est ouverte, et le champ qui reçoit le focus. */
export interface ReferenceTarget {
  index: number;
  field: 'sku' | 'barcode';
}

/**
 * Formats du formulaire article : format unique (une ligne, cartes Prix et Stock) ou tableau
 * (« Plusieurs formats »). Ajout, suppression, retrait de la vente et raccourcis de saisie.
 */
export function useProductFormats(form: UseFormReturn<ProductFormValues>) {
  const { control, getValues, setValue, setFocus, clearErrors, formState } = form;
  const array = useFieldArray({ control, name: 'formats', keyName: 'key' });
  const [rows, multi] = useWatch({ control, name: ['formats', 'multi'] });
  const [references, setReferences] = useState<ReferenceTarget | null>(null);
  const activeCount = rows.filter((r) => r.is_active).length;

  /** Le format unique devient la première ligne, à nommer, suivie d'une ligne vide. */
  function toMulti() {
    flushSync(() => {
      setValue('multi', true, { shouldDirty: true });
      array.append(emptyRow(), { shouldFocus: false });
    });
    setFocus('formats.0.name');
  }

  /** Retour au format unique (il ne reste qu'une ligne) : elle reprend le nom par défaut. */
  function toSingle() {
    setValue('formats.0.name', '', { shouldDirty: true });
    clearErrors('formats.0.name');
    setValue('multi', false, { shouldDirty: true });
  }

  /** Recopie la valeur de la première ligne dans les suivantes. */
  function copyFirst(field: 'selling_price' | 'low_stock_threshold') {
    const value = getValues(`formats.0.${field}`);
    for (let i = 1; i < rows.length; i += 1) {
      setValue(`formats.${i}.${field}`, value, { shouldDirty: true, shouldValidate: formState.isSubmitted });
    }
  }

  return {
    keys: array.fields.map((f) => f.key),
    rows,
    multi,
    references,
    setReferences,
    toMulti,
    toSingle,
    add: () => array.append(emptyRow(), { focusName: `formats.${rows.length}.name` }),
    remove: (index: number) => array.remove(index),
    toggleActive: (index: number) => setValue(`formats.${index}.is_active`, !getValues(`formats.${index}.is_active`), { shouldDirty: true }),
    samePrice: () => copyFirst('selling_price'),
    sameThreshold: () => copyFirst('low_stock_threshold'),
    /** La dernière ligne en vente ne se retire ni ne se supprime : un article garde un format en vente. */
    isLastActive: (index: number) => rows[index]?.is_active === true && activeCount === 1,
  };
}

export type ProductFormats = ReturnType<typeof useProductFormats>;
