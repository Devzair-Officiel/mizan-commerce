'use client';

import { Controller, useFormState } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { QuantityStepper } from '../QuantityStepper';
import type { StockEntryForm } from './useStockEntryForm';

interface EntryQuantityFieldProps {
  form: StockEntryForm;
  index: number;
  label: string;
  className?: string;
}

/** Quantité d'une ligne (boutons Moins et Plus), son erreur juste dessous. */
export function EntryQuantityField({ form, index, label, className }: EntryQuantityFieldProps) {
  const t = useTranslations('stock.entry');
  const { errors } = useFormState({ control: form.control, name: `lines.${index}.quantity` });
  const error = errors.lines?.[index]?.quantity?.message;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Controller control={form.control} name={`lines.${index}.quantity`} render={({ field }) => (
        <QuantityStepper ref={field.ref} value={field.value} onChange={field.onChange} onBlur={field.onBlur} size="sm"
          aria-label={t('line_quantity', { label })} aria-invalid={error ? true : undefined} />
      )} />
      {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
