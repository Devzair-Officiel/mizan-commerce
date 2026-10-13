'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useStockFormat } from '../useStockFormat';
import type { StockEntryTotals } from './useStockEntryForm';

interface StockEntryFooterProps {
  totals: StockEntryTotals;
  currencyCode: string;
  /** Facture : « 3 lignes » ; saisie : « 3 articles ». */
  invoice: boolean;
}

/** Pied du tableau : « 3 articles, 26 unités » à gauche, « Total achat 477,00 € » à droite. */
export function StockEntryFooter({ totals, currencyCode, invoice }: StockEntryFooterProps) {
  const t = useTranslations('stock.entry');
  const f = useStockFormat();
  const formatMoney = useFormatMoney();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3.5 text-sm lg:px-4.5">
      <span className="text-muted-foreground">
        {t('footer_count', { invoice: String(invoice), count: totals.count, units: totals.units, unitsLabel: f.quantity(totals.units) })}
      </span>
      <span className="text-muted-foreground">
        {t.rich('footer_total', {
          amount: formatMoney(totals.amount, currencyCode),
          b: (chunks) => <b className="ms-1 font-bold text-foreground tabular-nums">{chunks}</b>,
        })}
      </span>
    </div>
  );
}
