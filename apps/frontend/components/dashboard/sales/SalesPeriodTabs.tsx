'use client';

import { useTranslations } from 'next-intl';
import { SALES_PERIODS, type SalesPeriod } from '@/lib/hooks/useDashboard';
import { cn } from '@/lib/utils';

interface SalesPeriodTabsProps {
  value: SalesPeriod;
  onChange: (period: SalesPeriod) => void;
}

/** « 7 jours / 12 mois / Depuis le début », dans l'en-tête teinté de la carte Ventes. */
export function SalesPeriodTabs({ value, onChange }: SalesPeriodTabsProps) {
  const t = useTranslations('dashboard.sales');
  return (
    <div role="group" aria-label={t('period_label')} className="inline-flex gap-0.5 rounded-xl border border-border bg-card p-0.75">
      {SALES_PERIODS.map((period) => {
        const selected = period === value;
        return (
          <button key={period} type="button" aria-pressed={selected} onClick={() => onChange(period)}
            className={cn(
              'h-7.5 whitespace-nowrap rounded-lg px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
            )}>
            {t('period', { period })}
          </button>
        );
      })}
    </div>
  );
}
