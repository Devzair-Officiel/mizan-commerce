'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { getInitials } from '@/components/customers/detail/constants';
import { useFormatDate, useFormatMoney, useFormatShopDate } from '@/lib/hooks/useFormat';
import type { Quote } from '@/lib/hooks/useQuotes';

/** Bandeau : client et date d'envoi, total TTC puis HT, validité (jours restants calculés par le serveur). */
export function QuoteBanner({ quote: q }: { quote: Quote }) {
  const t = useTranslations('quotes');
  const money = useFormatMoney();
  const shopDate = useFormatShopDate();
  const date = useFormatDate();
  const name = q.buyer_name || t('no_customer');
  return <section aria-label={t('detail.banner')} className="rounded-2xl border border-border bg-card p-4 lg:p-5">
    <div className="flex items-center gap-3">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">{getInitials(name)}</span>
      <div className="min-w-0 flex-1">
        <p dir="auto" className="text-[0.9375rem] font-semibold wrap-break-word">{name}</p>
        {q.sent_at && <p className="text-[0.8125rem] text-muted-foreground">{t('detail.sent_on', { date: shopDate(q.sent_at, { dateStyle: 'medium' }) })}</p>}
      </div>
      {q.customer && <Link href={`/customers/${q.customer}`} className="inline-flex min-h-11 shrink-0 items-center text-[0.8125rem] font-semibold text-primary hover:underline">
        {t('detail.customer_card')}
      </Link>}
    </div>
    <p className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight tabular-nums">{money(q.total_ttc, q.currency)}</p>
    <p className="mt-1 text-[0.8125rem] text-muted-foreground tabular-nums">{t('detail.amounts', { ht: money(q.subtotal_ht, q.currency) })}</p>
    {q.valid_until && <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem]">
      <CalendarClock size={16} aria-hidden className="shrink-0 text-muted-foreground" />
      {t('detail.validity', {
        status: q.status, days: q.days_remaining ?? 0, date: date(q.valid_until, { dateStyle: 'long', timeZone: 'UTC' }),
      })}
    </p>}
  </section>;
}
