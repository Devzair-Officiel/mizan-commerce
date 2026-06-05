'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { computeDelta } from './utils';

interface KpiCardsProps {
  hasData: boolean;
  revenueToday: number;
  revenueYesterday: number;
  ordersCount: number;
  avgTicket: number;
  currency: string;
}

export function KpiCards({
  hasData, revenueToday, revenueYesterday, ordersCount, avgTicket, currency,
}: KpiCardsProps) {
  const t = useTranslations('dashboard.kpi');
  const formatMoney = useFormatMoney();
  const delta = computeDelta(revenueToday, revenueYesterday);

  const deltaLabel = delta
    ? delta.pct === 0
      ? t('delta_same')
      : t('delta_change', { sign: delta.pct > 0 ? '+' : '', pct: delta.pct })
    : null;

  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-3">
      <Link
        href="/orders?period=today"
        className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-1 text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TrendingUp size={12} />
          {t('revenue_today')}
        </div>
        <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums truncate">
          {hasData ? formatMoney(revenueToday, currency, { maximumFractionDigits: 0 }) : '—'}
        </div>
        {hasData && deltaLabel && (
          <div className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
            delta!.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {delta!.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {deltaLabel}
          </div>
        )}
        {hasData && !delta && (
          <div className="text-[11px] text-muted-foreground">{t('today_label')}</div>
        )}
      </Link>
      <Link
        href="/orders?period=today"
        className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-1 text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Receipt size={12} />
          {t('sales')}
        </div>
        <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums">
          {hasData ? ordersCount : '—'}
        </div>
        <div className="text-[11px] text-muted-foreground">{t('today_label')}</div>
      </Link>
      <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1">
        <div className="text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('avg_ticket')}
        </div>
        <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums truncate">
          {hasData ? formatMoney(avgTicket, currency, { maximumFractionDigits: 0 }) : '—'}
        </div>
        <div className="text-[11px] text-muted-foreground">{t('today_label')}</div>
      </div>
    </div>
  );
}
