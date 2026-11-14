'use client';

import { useId } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { QuantityStepper } from '@/components/stock/QuantityStepper';
import { useFormatNumber } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { lineLeft, quantityOf, type CreditNoteValues } from './useCreditNoteForm';

interface CreditNoteLinesProps {
  invoice: Invoice;
  control: Control<CreditNoteValues>;
}

/** Une ligne de la facture : désignation, reste à créditer et quantité (0 à ce reste). */
function CreditNoteLine({ line, index, control }: { line: Invoice['lines'][number]; index: number; control: Control<CreditNoteValues> }) {
  const t = useTranslations('invoices.credit');
  const number = useFormatNumber();
  const id = useId();
  const left = lineLeft(line);
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
    <div className="min-w-0 flex-1 basis-40">
      <p className="text-sm font-semibold break-words">{line.description}</p>
      <p id={`${id}-left`} className="text-xs text-muted-foreground tabular-nums">
        {left > 0 ? t('line_left', { left: number(left), quantity: number(Number(line.quantity)) }) : t('line_done')}
      </p>
    </div>
    {left > 0 && <Controller control={control} name={`lines.${index}.quantity`} render={({ field }) => {
      const invalid = quantityOf(field.value, left) === null;
      return <div className="flex w-36 flex-col gap-1">
        <QuantityStepper value={field.value} onChange={field.onChange} onBlur={field.onBlur} min={0} max={left}
          aria-label={t('quantity_label', { name: line.description })} aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-left ${id}-error` : `${id}-left`} />
        {invalid && <p id={`${id}-error`} className="text-xs font-medium text-red-700 dark:text-red-400">{t('quantity_invalid', { max: number(left) })}</p>}
      </div>;
    }} />}
  </li>;
}

/** Quantités à créditer, ligne par ligne (mode partiel). */
export function CreditNoteLines({ invoice, control }: CreditNoteLinesProps) {
  const t = useTranslations('invoices.credit');
  return <fieldset className="flex flex-col">
    <legend className="text-[0.8125rem] font-semibold text-foreground">{t('lines')}</legend>
    <ul className="flex flex-col divide-y divide-border">
      {invoice.lines.map((line, index) => <CreditNoteLine key={line.id} line={line} index={index} control={control} />)}
    </ul>
  </fieldset>;
}
