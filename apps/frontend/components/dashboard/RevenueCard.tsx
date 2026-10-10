'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney, useFormatDate } from '@/lib/hooks/useFormat';
import { SectionCard } from '@/components/ui/SectionCard';
import type { RevenueDayPoint } from '@/lib/hooks/useDashboard';

interface Props {
  points: RevenueDayPoint[];
  currency: string;
  todayRevenue: string;
  todayOrdersCount: number;
  revenueDeltaText?: string;
  revenueDeltaColor: string;
}

const BAR_MAX_REM = 6;

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
    <SectionCard
      title={t('title')}
      rightSlot={<span className="text-muted-foreground">{t('header_meta')}</span>}
    >
      <div className="p-5 flex flex-col gap-5">
        <div>
          <p className="text-sm text-muted-foreground">{t('today_label')}</p>
          <p className="text-[2rem] font-bold tabular-nums text-foreground leading-tight">
            {formatMoney(todayRevenue, currency)}
          </p>
          {todayOrdersCount > 0 && avgBasket && (
            <p className="text-[0.8125rem] text-muted-foreground mt-0.5">
              {t('orders_summary', { count: todayOrdersCount, avg: avgBasket })}
            </p>
          )}
          {revenueDeltaText && (
            <p className={`text-[0.8125rem] font-medium mt-0.5 ${revenueDeltaColor}`}>{revenueDeltaText}</p>
          )}
        </div>

        <div role="img" aria-label={ariaLabel} className="flex items-end gap-2" style={{ height: '7.5rem' }}>
          {points.map((p, i) => {
            const val = values[i] ?? 0;
            const isToday = p.date === todayDate;
            const isZero = val <= 0;
            const barH = isZero ? 0.1875 : Math.max(Number((val / max * BAR_MAX_REM).toFixed(4)), 0.25);
            const dayLabel = isToday
              ? t('today')
              : formatDate(p.date, { weekday: 'short' });
            return (
              <div key={p.date} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div
                  className={`w-full rounded-t-md transition-all ${isZero ? 'bg-border' : isToday ? 'bg-primary' : 'bg-primary/25'}`}
                  style={{ height: `${barH}rem` }}
                  title={`${formatMoney(p.revenue, currency)} — ${formatDate(p.date, { day: '2-digit', month: 'short' })}`}
                />
                <span className={`text-xs leading-none truncate max-w-full ${isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {dayLabel}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3.5">
          <span className="text-[0.8125rem] text-muted-foreground">{t('footer_label')}</span>
          <span className="text-[0.8125rem] font-semibold text-foreground">{formatMoney(total7d, currency)}</span>
        </div>
      </div>
    </SectionCard>
  );
}
