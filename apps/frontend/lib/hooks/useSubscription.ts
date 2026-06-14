import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type PlanCode = 'free' | 'pro' | 'boutique_plus';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'paused';

/**
 * Plan tel qu'exposé par le backend (serializer `SubscriptionPlanSerializer`).
 * `features_json` contient la liste des features débloquées par le plan
 * (cf. `apps.subscriptions.permissions.FEATURE_MIN_PLAN` côté backend).
 */
export interface SubscriptionPlan {
  id: string;
  code: PlanCode;
  name: string;
  description: string;
  price_amount: string;
  currency: string;
  billing_period: 'month' | 'year' | 'lifetime' | '';
  max_products: number | null;
  max_orders_per_month: number | null;
  features_json: string[];
  is_active: boolean;
}

export interface Subscription {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  is_trial_expired: boolean;
  /**
   * Plan *réellement* en vigueur côté gating. Diffère de `plan.code` si le
   * trial est expiré mais que la tâche Celery n'a pas encore rebasculé sur
   * Gratuit — le frontend doit donc gater sur `effective_plan_code`, pas
   * sur `plan.code`.
   */
  effective_plan_code: PlanCode;
  days_remaining: number | null;
  created_at: string;
  updated_at: string;
}

export function useSubscription() {
  return useQuery({
    queryKey: qk.subscription.current,
    queryFn: () => apiFetch<Subscription>('/subscriptions/current/'),
  });
}

/**
 * Résilie la souscription courante et bascule sur Gratuit.
 *
 * Tant que Stripe n'est pas branché, c'est la seule mutation acceptée par
 * `POST /api/subscriptions/change/`. Un envoi avec `plan_code` autre que
 * 'free' renvoie 400 côté backend.
 */
export function useDowngradeToFree() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Subscription>('/subscriptions/change/', {
        method: 'POST',
        body: JSON.stringify({ plan_code: 'free' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.subscription.all }),
  });
}
