import type { Subscription, SubscriptionPlan } from '@/lib/hooks/useSubscription';

export type BillingPeriod = 'month' | 'year';

/** Formule mise en avant (cadre primaire, onglet ouvert par défaut hors formule payante). */
export const RECOMMENDED_PLAN = 'boutique';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Prix de la formule sur la période (chaîne décimale de l'API). */
export function planPrice(plan: SubscriptionPlan, period: BillingPeriod): string {
  return period === 'year' ? plan.price_yearly_amount : plan.price_amount;
}

/**
 * Mois offerts par le paiement annuel, garantis sur toutes les formules payantes
 * (12 − prix annuel / prix mensuel, la plus petite valeur, arrondie). 0 : rien à afficher.
 */
export function freeMonthsPerYear(plans: SubscriptionPlan[]): number {
  const months = plans.flatMap((plan) => {
    const monthly = Number(plan.price_amount);
    const yearly = Number(plan.price_yearly_amount);
    return monthly > 0 && yearly > 0 ? [12 - yearly / monthly] : [];
  });
  return months.length ? Math.max(0, Math.round(Math.min(...months))) : 0;
}

/** « Jour N sur 14 » : la durée vient des bornes de la période d'essai renvoyées par l'API. */
export function trialProgress(subscription: Subscription): { day: number; total: number } | null {
  const { current_period_start: start, current_period_end: end, days_remaining: left } = subscription;
  if (!start || !end || left === null) return null;
  const total = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS));
  return { day: Math.min(total, Math.max(1, total - left)), total };
}
