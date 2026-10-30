'use client';

import { useTranslations } from 'next-intl';
import { useFormatDate, useFormatMoney, useFormatShopDate } from '@/lib/hooks/useFormat';
import type { Quote } from '@/lib/hooks/useQuotes';
import type { DataTableColumn } from '@/components/list/dataTableTypes';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { QuoteStatusBadge } from './QuoteStatusBadge';

/** Colonnes de la liste des devis : sans tri (ordre du serveur, brouillons d'abord). */
export function useQuoteColumns(): DataTableColumn<Quote>[] {
  const t = useTranslations('quotes');
  const money = useFormatMoney();
  const date = useFormatShopDate();
  const calendarDate = useFormatDate();
  const muted = 'whitespace-nowrap text-[0.8125rem] text-muted-foreground';
  return [
    { key: 'number', header: t('columns.number'), primary: true,
      cell: q => <span className="text-sm font-semibold whitespace-nowrap">{q.number ? <OrderNumber>{q.number}</OrderNumber> : t('no_number')}</span> },
    { key: 'buyer_name', header: t('columns.buyer_name'), cell: q => <span className="text-sm font-medium">{q.buyer_name || t('no_customer')}</span> },
    { key: 'sent_at', header: t('columns.sent_at'), cell: q => <span className={muted}>{q.sent_at ? date(q.sent_at, { dateStyle: 'medium' }) : '—'}</span> },
    { key: 'valid_until', header: t('columns.valid_until'),
      cell: q => <span className={muted}>{q.valid_until ? calendarDate(q.valid_until, { dateStyle: 'medium', timeZone: 'UTC' }) : '—'}</span> },
    { key: 'total_ttc', header: t('columns.total_ttc'), align: 'end',
      cell: q => <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{money(q.total_ttc, q.currency)}</span> },
    { key: 'status', header: t('columns.status'), cell: q => <QuoteStatusBadge status={q.status} /> },
  ];
}
