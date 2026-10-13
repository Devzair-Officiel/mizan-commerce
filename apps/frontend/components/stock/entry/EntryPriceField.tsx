'use client';

import { useFormState } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { cn } from '@/lib/utils';
import type { StockEntryForm } from './useStockEntryForm';

interface EntryPriceFieldProps {
  form: StockEntryForm;
  index: number;
  label: string;
  currency: string;
  className?: string;
}

/** Prix d'achat unitaire d'une ligne, aligné à droite avec la devise. */
export function EntryPriceField({ form, index, label, currency, className }: EntryPriceFieldProps) {
  const t = useTranslations('stock.entry');
  const { errors } = useFormState({ control: form.control, name: `lines.${index}.price` });
  const error = errors.lines?.[index]?.price?.message;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <FieldSuffix suffix={currency}>
        <input {...form.register(`lines.${index}.price`)} inputMode="decimal" autoComplete="off"
          aria-label={t('line_price', { label })} aria-invalid={error ? true : undefined}
          className={cn(FIELD_CONTROL, 'h-9.5 pe-9 text-end tabular-nums')} />
      </FieldSuffix>
      {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
