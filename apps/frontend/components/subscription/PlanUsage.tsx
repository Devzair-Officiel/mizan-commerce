'use client';

import { UsageCard } from '@/components/subscription/UsageCard';
import type { UsageCounter, UsageKey } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

const ORDER: readonly UsageKey[] = ['orders_this_month', 'products', 'customers', 'members'];

/** Colonnes sur desktop selon le nombre de cartes (3 sans la jauge « équipe », 4 avec) ; 2 sur mobile. */
const COLUMNS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

/** Cartes de « Votre activité » : seuls les compteurs fournis et limités (par la formule, ou par Découverte en comparaison). */
export function PlanUsage({ usage }: { usage: Partial<Record<UsageKey, UsageCounter>> }) {
  const limited = ORDER.flatMap((key) => {
    const counter = usage[key];
    return !counter || counter.limit === null ? [] : [{ key, count: counter.count, limit: counter.limit }];
  });
  if (limited.length === 0) return null;
  return (
    <div className={cn('grid grid-cols-2 gap-3', COLUMNS[limited.length])}>
      {limited.map(({ key, count, limit }) => <UsageCard key={key} usageKey={key} count={count} limit={limit} />)}
    </div>
  );
}
