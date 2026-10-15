'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { InvoiceLineStateBadge } from './InvoiceLineStateBadge';
import type { StockEntryForm } from './useStockEntryForm';

interface InvoiceIgnoredLineProps {
  form: StockEntryForm;
  index: number;
  /** Format associé ou texte lu. */
  label: string;
  readLabel: string;
  /** Total de la ligne, barré : il n'entre pas dans l'entrée. */
  total: string | null;
  /** Ligne du tableau (desktop) ou carte (mobile). */
  layout: 'row' | 'card';
}

const CELL = 'px-4.5 py-3 align-middle';
const STRUCK = 'block truncate text-muted-foreground line-through';

/** Ligne de facture ignorée (frais de port, remise…) : barrée, hors de l'entrée, avec « Rétablir ». */
export function InvoiceIgnoredLine({ form, index, label, readLabel, total, layout }: InvoiceIgnoredLineProps) {
  const t = useTranslations('stock.invoice');
  const restore = (
    <Button data-invoice-restore={index} type="button" variant="ghost" size="sm" aria-label={t('restore_line', { label: readLabel })}
      onClick={() => form.setValue(`lines.${index}.ignored`, false, { shouldDirty: true })} className="h-9 rounded-full px-3">
      <RotateCcw aria-hidden />
      {t('restore')}
    </Button>
  );

  if (layout === 'card') {
    return (
      <li className="flex flex-col gap-2 bg-muted/40 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span dir="auto" className={`${STRUCK} min-w-0 flex-1 text-sm font-medium`}>{label}</span>
          {restore}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <InvoiceLineStateBadge state="ignored" />
          <span dir="auto" className={`${STRUCK} font-mono text-xs`}>{readLabel}</span>
          {total && <span className="ms-auto shrink-0 text-sm text-muted-foreground line-through tabular-nums">{total}</span>}
        </div>
      </li>
    );
  }
  return (
    <tr className="border-t border-border bg-muted/40">
      <td className={`${CELL} max-w-64`}><span dir="auto" className={`${STRUCK} text-sm font-medium`}>{label}</span></td>
      <td className={CELL}><InvoiceLineStateBadge state="ignored" /></td>
      <td className={`${CELL} max-w-48`}><span dir="auto" className={`${STRUCK} font-mono text-[0.8125rem]`}>{readLabel}</span></td>
      <td className={CELL} colSpan={2}><span className="text-[0.8125rem] text-muted-foreground">{t('ignored_note')}</span></td>
      <td className={`${CELL} text-end text-sm whitespace-nowrap text-muted-foreground line-through tabular-nums`}>{total}</td>
      <td className="py-3 pe-3 align-middle">{restore}</td>
    </tr>
  );
}
