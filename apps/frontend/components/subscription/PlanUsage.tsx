'use client';

import { UsageGauge } from '@/components/subscription/UsageGauge';
import type { UsageCounter, UsageKey } from '@/lib/hooks/useSubscription';

const ORDER: readonly UsageKey[] = ['orders_this_month', 'products', 'customers', 'members'];

/** Jauges de « Votre activité » : seuls les compteurs fournis et limités (par la formule, ou par Découverte en comparaison). */
export function PlanUsage({ usage }: { usage: Partial<Record<UsageKey, UsageCounter>> }) {
  const limited = ORDER.flatMap((key) => {
    const counter = usage[key];
    return !counter || counter.limit === null ? [] : [{ key, count: counter.count, limit: counter.limit }];
  });
  if (limited.length === 0) return null;
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {limited.map(({ key, count, limit }) => <UsageGauge key={key} usageKey={key} count={count} limit={limit} />)}
    </div>
  );
}
