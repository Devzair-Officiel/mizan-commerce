'use client';

import { Controller, useFormState } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { QuantityStepper } from '../QuantityStepper';
import type { StockExitForm } from './useStockExitForm';

interface ExitQuantityFieldProps {
  form: StockExitForm;
  index: number;
  label: string;
  /** Correction : quantité comptée, qui peut valoir 0. */
  counting: boolean;
  className?: string;
}

/** Quantité sortie ou comptée d'une ligne (boutons Moins et Plus), son erreur juste dessous. */
export function ExitQuantityField({ form, index, label, counting, className }: ExitQuantityFieldProps) {
  const t = useTranslations('stock.exit');
  const { errors } = useFormState({ control: form.control, name: `lines.${index}.quantity` });
  const error = errors.lines?.[index]?.quantity?.message;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Controller control={form.control} name={`lines.${index}.quantity`} render={({ field }) => (
        <QuantityStepper ref={field.ref} value={field.value} onChange={field.onChange} onBlur={field.onBlur} size="sm"
          min={counting ? 0 : 1} aria-label={t(counting ? 'line_counted' : 'line_quantity', { label })}
          aria-invalid={error ? true : undefined} />
      )} />
      {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
