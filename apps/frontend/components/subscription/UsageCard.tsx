'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { USAGE_BAR, USAGE_TEXT } from '@/components/subscription/UsageGauge';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { usageLevel } from '@/lib/hooks/usePlanUsage';
import type { UsageKey } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

interface UsageCardProps {
  usageKey: UsageKey;
  count: number;
  /** `null` : ressource illimitée par la formule. */
  limit: number | null;
}

const CARD = 'flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4';

/**
 * Carte de « Votre activité » : libellé, « 22 / 15 » en gros, barre, statut écrit (y compris « Dans la limite »).
 * Ressource illimitée : le compte seul et « Illimité », sans barre ni couleur de niveau.
 */
export function UsageCard({ usageKey, count, limit }: UsageCardProps) {
  const t = useTranslations('settings.usage');
  const kind = useCatalogKind();
  const labelId = useId();
  const label = <p id={labelId} className="text-xs font-medium text-muted-foreground">{t(`short.${usageKey}`, { kind })}</p>;

  if (limit === null) {
    return (
      <div className={CARD} data-usage={usageKey} data-level="unlimited">
        {label}
        <p className="text-3xl font-semibold tabular-nums text-foreground">{count}</p>
        <p className="text-xs font-semibold text-muted-foreground">{t('unlimited')}</p>
      </div>
    );
  }

  const level = usageLevel({ count, limit });
  const percent = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 100;
  return (
    <div className={CARD} data-usage={usageKey} data-level={level}>
      {label}
      <p className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-3xl font-semibold text-foreground">{count}</span>
        <span className="text-sm text-muted-foreground">/ {limit}</span>
      </p>
      <div role="progressbar" aria-labelledby={labelId} aria-valuenow={count} aria-valuemin={0} aria-valuemax={limit}
        className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-300', USAGE_BAR[level])} style={{ width: `${percent}%` }} />
      </div>
      {/* Le niveau en toutes lettres : la couleur seule ne suffit pas. */}
      <p className={cn('text-xs font-semibold', level === 'ok' ? 'text-muted-foreground' : USAGE_TEXT[level])}>
        {t('level', { level: count > limit ? 'over' : level })}
      </p>
    </div>
  );
}
