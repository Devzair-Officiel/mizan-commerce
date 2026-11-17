'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { Quote } from '@/lib/hooks/useQuotes';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { QuoteStatusBadge } from './QuoteStatusBadge';
import { quoteHref } from './status';

export function QuoteRow({ quote: q }: { quote: Quote }) {
  const t = useTranslations('quotes');
  const money = useFormatMoney();
  const date = useFormatDate();
  return <Link href={quoteHref(q)} className="flex flex-col gap-2.5 px-4 py-3.5 text-foreground transition-colors active:bg-muted">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-semibold break-words">{q.number ? <OrderNumber>{q.number}</OrderNumber> : t('no_number')}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{q.buyer_name || t('no_customer')}</p></div>
      <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{money(q.total_ttc, q.currency)}</span>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <QuoteStatusBadge status={q.status} />
      {q.valid_until && <span className="text-xs text-muted-foreground">{t('valid_until', { date: date(q.valid_until, { dateStyle: 'medium', timeZone: 'UTC' }) })}</span>}
    </div>
  </Link>;
}
