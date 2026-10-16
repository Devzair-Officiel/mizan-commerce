'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { usageLevel, type UsageLevel } from '@/lib/hooks/usePlanUsage';
import type { UsageKey } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

/** Couleur du texte d'une jauge selon son niveau (partagée avec `UsageCard`). */
export const USAGE_TEXT: Record<UsageLevel, string> = {
  ok: 'text-foreground',
  near: 'text-amber-700 dark:text-amber-400',
  reached: 'text-red-700 dark:text-red-400',
};

/** Couleur de la barre d'une jauge selon son niveau (partagée avec `UsageCard`). */
export const USAGE_BAR: Record<UsageLevel, string> = {
  ok: 'bg-primary',
  near: 'bg-amber-600 dark:bg-amber-400',
  reached: 'bg-red-600 dark:bg-red-400',
};

interface UsageGaugeProps {
  usageKey: UsageKey;
  count: number;
  limit: number;
  labelClassName?: string;
}

/** « 12 / 15 ventes ce mois » et sa barre : ambre à partir de 80 %, rouge à la limite, niveau écrit en clair. */
export function UsageGauge({ usageKey, count, limit, labelClassName }: UsageGaugeProps) {
  const t = useTranslations('settings.usage');
  const kind = useCatalogKind();
  const labelId = useId();
  const level = usageLevel({ count, limit });
  const percent = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 100;

  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-usage={usageKey} data-level={level}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <p id={labelId} className={cn('min-w-0 text-[0.8125rem] font-medium tabular-nums', USAGE_TEXT[level], labelClassName)}>
          {t(usageKey, { count, limit, kind })}
        </p>
        {/* Le niveau en toutes lettres : la couleur seule ne suffit pas. */}
        {level !== 'ok' && (
          <span className={cn('shrink-0 text-xs font-semibold', USAGE_TEXT[level])}>
            {t('level', { level: count > limit ? 'over' : level })}
          </span>
        )}
      </div>
      <div role="progressbar" aria-labelledby={labelId} aria-valuenow={count} aria-valuemin={0} aria-valuemax={limit}
        className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-300', USAGE_BAR[level])} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
