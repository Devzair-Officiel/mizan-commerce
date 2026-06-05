import Link from 'next/link';
import { Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { computeDelta, formatRevenue } from './utils';

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
  const delta = computeDelta(revenueToday, revenueYesterday);

  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-3">
      <Link
        href="/orders?period=today"
        className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-1 text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <TrendingUp size={12} />
          CA jour
        </div>
        <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums truncate">
          {hasData ? formatRevenue(revenueToday, currency) : '—'}
        </div>
        {hasData && delta && (
          <div className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
            delta.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {delta.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta.label}
          </div>
        )}
        {hasData && !delta && (
          <div className="text-[11px] text-muted-foreground">Aujourd&apos;hui</div>
        )}
      </Link>
      <Link
        href="/orders?period=today"
        className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-1 text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Receipt size={12} />
          Ventes
        </div>
        <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums">
          {hasData ? ordersCount : '—'}
        </div>
        <div className="text-[11px] text-muted-foreground">Aujourd&apos;hui</div>
      </Link>
      <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1">
        <div className="text-[10px] lg:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ticket moyen
        </div>
        <div className="text-lg lg:text-2xl font-bold text-foreground tabular-nums truncate">
          {hasData ? formatRevenue(avgTicket, currency) : '—'}
        </div>
        <div className="text-[11px] text-muted-foreground">Aujourd&apos;hui</div>
      </div>
    </div>
  );
}
