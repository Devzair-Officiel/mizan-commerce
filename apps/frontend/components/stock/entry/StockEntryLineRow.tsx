'use client';

import { useTranslations } from 'next-intl';
import { StockVariantCell } from '../StockVariantCell';
import { EntryPriceField } from './EntryPriceField';
import { EntryQuantityField } from './EntryQuantityField';
import { EntryRemoveButton } from './EntryRemoveButton';
import { EntryStockChange } from './EntryStockChange';
import { InvoiceLineArticle } from './InvoiceLineArticle';
import { InvoiceLineStateBadge } from './InvoiceLineStateBadge';
import { currencySymbol, type StockEntryLineProps } from './stockEntryLineTypes';
import { useEntryLine } from './useEntryLine';

const CELL = 'px-4.5 py-3 align-middle';

/** Ligne du tableau d'entrée (desktop). */
export function StockEntryLineRow({ form, index, currencyCode, invoice, onRemove }: StockEntryLineProps) {
  const t = useTranslations('stock.common');
  const { line, label, added, total } = useEntryLine(form, index, currencyCode);

  return (
    <tr className="border-t border-border">
      <td className={`${CELL} max-w-64`}>
        {invoice
          ? <InvoiceLineArticle form={form} index={index} candidates={invoice.candidates} />
          : <StockVariantCell productName={line.name} packagingName={line.packaging} />}
      </td>
      {invoice ? (
        <>
          <td className={CELL}><InvoiceLineStateBadge associated={line.variant !== ''} /></td>
          <td className={`${CELL} max-w-48`}>
            <span dir="auto" className="block truncate font-mono text-[0.8125rem] text-muted-foreground">{line.readLabel}</span>
          </td>
        </>
      ) : (
        <td className={CELL}><EntryStockChange before={line.stock ?? '0'} added={added} /></td>
      )}
      <td className={CELL}><EntryQuantityField form={form} index={index} label={label} className="w-32" /></td>
      <td className={CELL}><EntryPriceField form={form} index={index} label={label} currency={currencySymbol(currencyCode)} className="w-28" /></td>
      <td className={`${CELL} text-end text-sm font-semibold whitespace-nowrap tabular-nums`}>
        {total ?? <span aria-label={t('none')}>—</span>}
      </td>
      <td className="py-3 pe-3 align-middle"><EntryRemoveButton label={label} onClick={onRemove} /></td>
    </tr>
  );
}
