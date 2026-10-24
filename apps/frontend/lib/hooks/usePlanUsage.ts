import { useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { subscriptionQuery, type SubscriptionPlan, type UsageCounter, type UsageKey } from '@/lib/hooks/useSubscription';

export type UsageLevel = 'ok' | 'near' | 'reached';

/** À partir de 80 % de la limite : jauge ambre et bandeau en haut de la liste. */
const NEAR_RATIO = 0.8;

export function usageLevel({ count, limit }: UsageCounter): UsageLevel {
  if (limit === null) return 'ok';
  if (count >= limit) return 'reached';
  return count >= limit * NEAR_RATIO ? 'near' : 'ok';
}

/**
 * Usage de la boutique face aux limites d'une autre formule que celle en vigueur (Découverte en fin
 * d'essai ou après une résiliation, formule d'un changement programmé) : mêmes comptes, autres limites.
 */
export function againstPlan(usage: Record<UsageKey, UsageCounter>, plan: SubscriptionPlan): Record<UsageKey, UsageCounter> {
  return {
    orders_this_month: { count: usage.orders_this_month.count, limit: plan.max_orders_per_month },
    products: { count: usage.products.count, limit: plan.max_products },
    customers: { count: usage.customers.count, limit: plan.max_customers },
    members: { count: usage.members.count, limit: plan.max_members },
  };
}

/**
 * Usage d'un compteur de la formule. Relu à chaque montage (`staleTime: 0` pour ce seul
 * observateur) : après une création, la liste affichée ensuite a le bon compte. Tant que
 * l'abonnement charge, rien n'est bloqué : le backend reste le filet.
 */
export function usePlanUsage(key: UsageKey | undefined): { counter?: UsageCounter; level: UsageLevel } {
  const { data } = useQuery({ ...subscriptionQuery, staleTime: 0, enabled: key !== undefined });
  const counter = key ? data?.usage?.[key] : undefined;
  return { counter, level: counter ? usageLevel(counter) : 'ok' };
}

/**
 * Bouton ou lien de création soumis à une limite : à la limite, le geste ouvre la carte de mise
 * à niveau au lieu de naviguer (le serveur refuserait la création). `sheet` se passe à `UpgradeSheet`.
 * Sans clé, rien n'est limité.
 */
export function useLimitGuard(key: UsageKey | undefined) {
  const t = useTranslations('settings.usage');
  const kind = useCatalogKind();
  const { counter, level } = usePlanUsage(key);
  const [open, setOpen] = useState(false);
  const reached = level === 'reached';

  function onClick(event: MouseEvent) {
    if (!reached) return;
    event.preventDefault();
    setOpen(true);
  }

  return {
    reached,
    onClick,
    sheet: {
      open,
      onClose: () => setOpen(false),
      feature: key ?? 'products',
      title: t('limit_title'),
      description: key && counter ? t(key, { count: counter.count, limit: counter.limit ?? 0, kind }) : undefined,
    },
  };
}
