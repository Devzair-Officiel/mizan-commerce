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

/** Ligne d'entrée en carte (mobile) : article, stock ou ligne lue, quantité et prix côte à côte, total. */
export function StockEntryLineCard({ form, index, currencyCode, invoice, onRemove }: StockEntryLineProps) {
  const t = useTranslations('stock.entry');
  const tc = useTranslations('stock.common');
  const { line, label, added, total } = useEntryLine(form, index, currencyCode);

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {invoice
            ? <InvoiceLineArticle form={form} index={index} candidates={invoice.candidates} />
            : <StockVariantCell productName={line.name} packagingName={line.packaging} />}
        </div>
        <EntryRemoveButton label={label} onClick={onRemove} />
      </div>
      {invoice ? (
        <div className="flex min-w-0 items-center gap-2">
          <InvoiceLineStateBadge associated={line.variant !== ''} />
          <span dir="auto" className="truncate font-mono text-xs text-muted-foreground">{line.readLabel}</span>
        </div>
      ) : (
        <p className="text-[0.8125rem] text-muted-foreground">
          {t('card_stock')} <EntryStockChange before={line.stock ?? '0'} added={added} />
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <EntryQuantityField form={form} index={index} label={label} />
        <EntryPriceField form={form} index={index} label={label} currency={currencySymbol(currencyCode)} />
      </div>
      <p className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t('line_total')}</span>
        <span className="font-semibold tabular-nums">{total ?? <span aria-label={tc('none')}>—</span>}</span>
      </p>
    </li>
  );
}
