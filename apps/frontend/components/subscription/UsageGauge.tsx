'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { usageLevel, type UsageLevel } from '@/lib/hooks/usePlanUsage';
import type { UsageKey } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

const TEXT: Record<UsageLevel, string> = {
  ok: 'text-foreground',
  near: 'text-amber-700 dark:text-amber-400',
  reached: 'text-red-700 dark:text-red-400',
};

const BAR: Record<UsageLevel, string> = {
  ok: 'bg-primary',
  near: 'bg-amber-600 dark:bg-amber-400',
  reached: 'bg-red-600 dark:bg-red-400',
};

interface UsageGaugeProps {
  usageKey: UsageKey;
  count: number;
  limit: number;
}

/** « 12 / 15 ventes ce mois » et sa barre : ambre à partir de 80 %, rouge à la limite. */
export function UsageGauge({ usageKey, count, limit }: UsageGaugeProps) {
  const t = useTranslations('settings.usage');
  const kind = useCatalogKind();
  const labelId = useId();
  const level = usageLevel({ count, limit });
  const percent = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 100;

  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-usage={usageKey} data-level={level}>
      <p id={labelId} className={cn('text-[0.8125rem] font-medium tabular-nums', TEXT[level])}>
        {t(usageKey, { count, limit, kind })}
      </p>
      <div role="progressbar" aria-labelledby={labelId} aria-valuenow={count} aria-valuemin={0} aria-valuemax={limit}
        className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-300', BAR[level])} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
