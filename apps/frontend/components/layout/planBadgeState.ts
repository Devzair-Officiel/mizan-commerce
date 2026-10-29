import type { PlanCode, Subscription } from '@/lib/hooks/useSubscription';

/**
 * Ce qu'affiche le badge d'abonnement (sidebar, menu mobile) : le code de la formule effective
 * (`effective_plan_code`, celle qui s'applique : une formule attribuée échue affiche Découverte dès
 * sa date de fin, sans attendre la tâche quotidienne), dont le nom est traduit à l'affichage
 * (comme sur la page Abonnement), jamais le nom brut de l'API.
 */
export type PlanBadgeState =
  | { kind: 'trial'; days: number }
  | { kind: 'expired' }
  | { kind: 'plan'; code: PlanCode };

export function planBadgeState(subscription: Subscription): PlanBadgeState {
  if (subscription.is_trial_expired) return { kind: 'expired' };
  const days = subscription.days_remaining;
  if (subscription.status === 'trialing' && days !== null && days >= 0) return { kind: 'trial', days };
  return { kind: 'plan', code: subscription.effective_plan_code };
}
