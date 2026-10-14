'use client';

import { useTranslations } from 'next-intl';
import { computeDelta } from '@/components/dashboard/utils';
import { useFormatDate, useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { SalesData } from '@/lib/hooks/useDashboard';

const CHANGE_TONE = {
  up: 'text-green-700 dark:text-green-400',
  down: 'text-amber-700 dark:text-amber-400',
  same: 'text-muted-foreground',
} as const;

/** Évolution en % : 7 jours → aujourd'hui contre hier ; 12 mois → contre les 12 mois précédents. */
function changeOf(data: SalesData): number | null {
  if (data.period === '7d') {
    const [yesterday, today] = data.points.slice(-2).map((p) => Number(p.revenue));
    return computeDelta(today ?? 0, yesterday ?? 0)?.pct ?? null;
  }
  return data.comparison?.change_pct ?? null;
}

/** Montant mis en avant et sa comparaison : aujourd'hui (7 jours), total (12 mois, depuis le début). */
export function SalesHeadline({ data, currency }: { data: SalesData; currency: string }) {
  const t = useTranslations('dashboard.sales');
  const formatMoney = useFormatMoney();
  const formatNumber = useFormatNumber();
  const formatDate = useFormatDate();
  const amount = data.period === '7d' ? (data.points.at(-1)?.revenue ?? '0') : data.total;
  const change = changeOf(data);
  const tone = change === null ? null : change > 0 ? 'up' : change < 0 ? 'down' : 'same';

  return (
    <div>
      <p className="text-[0.8125rem] text-muted-foreground">
        {t('headline_label', { period: data.period, date: formatDate(data.start, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) })}
      </p>
      <p className="mt-0.5 text-[1.875rem] font-bold leading-tight tabular-nums text-foreground">{formatMoney(amount, currency)}</p>
      {data.period === 'all' ? (
        <p className="mt-0.5 text-[0.8125rem] font-semibold text-muted-foreground">{t('orders', { count: data.orders_count })}</p>
      ) : tone && change !== null && (
        <p className={`mt-0.5 text-[0.8125rem] font-semibold ${CHANGE_TONE[tone]}`}>
          {t('change', { period: data.period, tone, pct: formatNumber(Math.abs(change)) })}
        </p>
      )}
    </div>
  );
}
