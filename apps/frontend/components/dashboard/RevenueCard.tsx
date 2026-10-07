'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney, useFormatDate } from '@/lib/hooks/useFormat';
import type { RevenueDayPoint } from '@/lib/hooks/useDashboard';

interface Props {
  points: RevenueDayPoint[];
  currency: string;
  todayRevenue: string;
  todayOrdersCount: number;
  revenueDeltaText?: string;
  revenueDeltaColor: string;
}

const BAR_MAX_PX = 96;

export function RevenueCard({ points, currency, todayRevenue, todayOrdersCount, revenueDeltaText, revenueDeltaColor }: Props) {
  const t = useTranslations('dashboard.revenue');
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const values = points.map((p) => parseFloat(p.revenue));
  const max = Math.max(...values, 0.01);
  const todayDate = points[points.length - 1]?.date;

  const total7d = values.reduce((sum, v) => sum + v, 0);

  const ariaLabel = points.map((p, i) => {
    const label = p.date === todayDate ? t('today') : formatDate(p.date, { weekday: 'long' });
    return `${label}: ${formatMoney(values[i] ?? 0, currency)}`;
  }).join(', ');

  const avgBasket = todayOrdersCount > 0
    ? formatMoney(parseFloat(todayRevenue) / todayOrdersCount, currency)
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div>
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {formatMoney(todayRevenue, currency)}
        </p>
        {revenueDeltaText && (
          <p className={`text-xs font-medium mt-0.5 ${revenueDeltaColor}`}>{revenueDeltaText}</p>
        )}
        {todayOrdersCount > 0 && avgBasket && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('orders_summary', { count: todayOrdersCount, avg: avgBasket })}
          </p>
        )}
      </div>

      <div role="img" aria-label={ariaLabel} className="flex items-end gap-1" style={{ height: `${BAR_MAX_PX + 16}px` }}>
        {points.map((p, i) => {
          const val = values[i] ?? 0;
          const isToday = p.date === todayDate;
          const isZero = val <= 0;
          const barH = isZero ? 3 : Math.max(Math.round(val / max * BAR_MAX_PX), 4);
          const dayLabel = isToday
            ? t('today')
            : formatDate(p.date, { weekday: 'short' });
          return (
            <div key={p.date} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div
                className={`w-full rounded-sm transition-all ${isZero ? 'bg-border' : isToday ? 'bg-primary' : 'bg-primary/25'}`}
                style={{ height: `${barH}px` }}
                title={`${formatMoney(p.revenue, currency)} — ${formatDate(p.date, { day: '2-digit', month: 'short' })}`}
              />
              <span className={`text-[9px] leading-none truncate max-w-full ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                {dayLabel}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-2">
        {t('footer', { amount: formatMoney(total7d, currency) })}
      </p>
    </div>
  );
}
