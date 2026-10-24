'use client';

import { UsageCard } from '@/components/subscription/UsageCard';
import type { UsageCounter, UsageKey } from '@/lib/hooks/useSubscription';
import { cn } from '@/lib/utils';

const ORDER: readonly UsageKey[] = ['orders_this_month', 'products', 'customers', 'members'];

/** Colonnes sur desktop selon le nombre de cartes (3 sans la jauge « équipe », 4 avec) ; 2 sur mobile. */
const COLUMNS: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' };

/** Formule à un seul membre (Découverte, Solo) et propriétaire seul : la jauge « équipe » n'apprend rien. */
function soloTeam({ count, limit }: UsageCounter): boolean {
  return limit !== null && limit <= 1 && count <= limit;
}

/**
 * Cartes de « Votre activité », face aux limites fournies (formule en vigueur, ou une autre formule
 * en comparaison) : limitées avec leur jauge, illimitées avec « Illimité ». Sans la carte « équipe »
 * quand la formule n'admet qu'un membre et que l'équipe y tient.
 */
export function PlanUsage({ usage }: { usage: Record<UsageKey, UsageCounter> }) {
  const shown = ORDER.filter((key) => key !== 'members' || !soloTeam(usage.members));
  return (
    <div className={cn('grid grid-cols-2 gap-3', COLUMNS[shown.length])}>
      {shown.map((key) => <UsageCard key={key} usageKey={key} count={usage[key].count} limit={usage[key].limit} />)}
    </div>
  );
}
