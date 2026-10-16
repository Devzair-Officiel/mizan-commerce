'use client';

import { useTranslations } from 'next-intl';
import type { BillingPeriod } from '@/lib/plan-pricing';
import { cn } from '@/lib/utils';

const PERIODS: readonly BillingPeriod[] = ['month', 'year'];

interface BillingPeriodToggleProps {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  /** Mois offerts par l'annuel, calculés depuis les prix ; 0 : pas de pastille. */
  freeMonths: number;
}

/** « Mensuel / Annuel · 2 mois offerts ». */
export function BillingPeriodToggle({ value, onChange, freeMonths }: BillingPeriodToggleProps) {
  const t = useTranslations('settings.subscription');
  return (
    <div role="group" aria-label={t('period_label')} className="inline-flex gap-1 rounded-xl bg-muted p-1">
      {PERIODS.map((period) => {
        const selected = period === value;
        return (
          <button key={period} type="button" aria-pressed={selected} onClick={() => onChange(period)}
            className={cn(
              'flex h-11 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] lg:h-9',
              selected ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
            )}>
            {t('period', { period })}
            {period === 'year' && freeMonths > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {t('free_months', { months: freeMonths })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
