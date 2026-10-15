import type { PlanCode, Subscription } from '@/lib/hooks/useSubscription';

/** Ce qu'affiche le badge d'abonnement de la sidebar et du menu mobile. */
export type PlanBadgeState =
  | { kind: 'trial'; days: number }
  | { kind: 'expired'; plan: PlanCode }
  | { kind: 'plan'; plan: PlanCode };

export function planBadgeState(subscription: Subscription): PlanBadgeState {
  const plan = subscription.effective_plan_code;
  if (subscription.is_trial_expired && plan === 'free') return { kind: 'expired', plan };
  const days = subscription.days_remaining;
  if (subscription.status === 'trialing' && days !== null && days >= 0) return { kind: 'trial', days };
  return { kind: 'plan', plan };
}
