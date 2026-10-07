'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney, useFormatDate } from '@/lib/hooks/useFormat';
import type { RevenueDayPoint } from '@/lib/hooks/useDashboard';

interface Props { points: RevenueDayPoint[]; currency: string; }

export function RevenueCard({ points, currency }: Props) {
  const t = useTranslations('dashboard.revenue');
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();

  const values = points.map((p) => parseFloat(p.revenue));
  const max = Math.max(...values, 0.01);
  const todayDate = points[points.length - 1]?.date;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        {t('title')}
      </p>
      <div role="img" aria-label={t('aria_label')} className="flex items-end gap-1 h-24">
        {points.map((p, i) => {
          const val = values[i] ?? 0;
          const pct = val / max;
          const isToday = p.date === todayDate;
          const isZero = val <= 0;
          return (
            <div key={p.date} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-sm transition-all ${isToday ? 'bg-primary' : 'bg-primary/25'}`}
                style={{ height: isZero ? '3px' : `${Math.max(pct * 100, 4)}%` }}
                title={`${formatMoney(p.revenue, currency)} — ${formatDate(p.date, { day: '2-digit', month: 'short' })}`}
              />
              {isToday && (
                <span className="text-[9px] font-medium text-primary leading-none">{t('today')}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
