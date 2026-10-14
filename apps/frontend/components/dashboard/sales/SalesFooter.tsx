'use client';

import { useTranslations } from 'next-intl';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { SalesData } from '@/lib/hooks/useDashboard';

interface SalesFooterProps {
  data: SalesData;
  currency: string;
  tableId: string;
  detail: boolean;
  onToggleDetail: () => void;
}

/**
 * Sous la courbe : total (7 jours) ; meilleur mois et moyenne (12 mois) ; granularité et
 * détail en tableau (depuis le début).
 */
export function SalesFooter({ data, currency, tableId, detail, onToggleDetail }: SalesFooterProps) {
  const t = useTranslations('dashboard.sales');
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const best = data.best_month;
  const current = best !== null && best.month === data.points.at(-1)?.date;

  return (
    <div className="flex flex-wrap justify-between gap-2 border-t border-border px-5 py-3 text-[0.8125rem] text-muted-foreground">
      {data.period === '7d' ? (
        <>
          <span>{t('total_label')}</span>
          <span className="font-semibold tabular-nums text-foreground">{formatMoney(data.total, currency)}</span>
        </>
      ) : data.period === '12m' ? (
        <>
          {best && (
            <span>
              {t('best_month', { month: formatDate(best.month, { month: 'long', year: 'numeric', timeZone: 'UTC' }), current: String(current) })}
            </span>
          )}
          {data.monthly_average !== null && <span>{t('average', { amount: formatMoney(data.monthly_average, currency) })}</span>}
        </>
      ) : (
        <>
          <span>{t('granularity', { granularity: data.granularity })}</span>
          <button type="button" aria-expanded={detail} aria-controls={tableId} onClick={onToggleDetail}
            className="rounded font-semibold text-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {detail ? t('detail_hide') : t('detail_show', { granularity: data.granularity })}
          </button>
        </>
      )}
    </div>
  );
}
