import type { Subscription } from '@/lib/hooks/useSubscription';

/**
 * Ce qu'affiche le badge d'abonnement (sidebar, menu mobile) : le nom de la formule tel que
 * GET /subscriptions/current/ le renvoie, sans logique propre à une formule.
 */
export type PlanBadgeState =
  | { kind: 'trial'; days: number }
  | { kind: 'expired' }
  | { kind: 'plan'; name: string };

export function planBadgeState(subscription: Subscription): PlanBadgeState {
  if (subscription.is_trial_expired) return { kind: 'expired' };
  const days = subscription.days_remaining;
  if (subscription.status === 'trialing' && days !== null && days >= 0) return { kind: 'trial', days };
  return { kind: 'plan', name: subscription.plan.name };
}
