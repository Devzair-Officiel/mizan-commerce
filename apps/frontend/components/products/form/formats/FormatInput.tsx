'use client';

import type { UseFormRegister } from 'react-hook-form';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import type { ProductFormValues } from '../productFormSchema';

export type FormatInputField = 'name' | 'selling_price' | 'purchase_price' | 'initial_stock' | 'low_stock_threshold';

/** Champ compact du tableau des formats : 40px, coins de 10px, chiffres tabulaires. */
const FORMAT_CONTROL = `${FIELD_CONTROL.replace('h-11', 'h-10').replace('rounded-xl', 'rounded-[0.625rem]').replace('px-3.5', 'px-2.5')} tabular-nums`;

interface FormatInputProps {
  register: UseFormRegister<ProductFormValues>;
  index: number;
  field: FormatInputField;
  /** Libellé, liaison à l'erreur : `aria-label` dans le tableau, attributs de `FormField` sur mobile. */
  a11y: { id?: string; 'aria-label'?: string; 'aria-describedby'?: string; 'aria-invalid'?: true; 'aria-required'?: true };
  /** Devise, côté fin du champ (« € »). */
  suffix?: string;
  placeholder?: string;
}

/** Champ d'une ligne de format : nom (texte) ou montant et quantité (clavier décimal). */
export function FormatInput({ register, index, field, a11y, suffix, placeholder }: FormatInputProps) {
  const isName = field === 'name';
  return (
    <div className="relative w-full">
      <input {...a11y} {...register(`formats.${index}.${field}`)} placeholder={placeholder} autoComplete="off"
        dir={isName ? 'auto' : undefined} inputMode={isName ? undefined : 'decimal'}
        className={`${FORMAT_CONTROL} ${suffix ? 'pe-6' : ''}`} />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 inset-e-2.5 flex items-center text-[0.8125rem] text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}
