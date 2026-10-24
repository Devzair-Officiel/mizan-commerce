import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

export type PlanCode = 'free' | 'solo' | 'boutique' | 'commerce_plus';
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
  /** Prix d'un an payé d'avance (« 0.00 » pour Découverte). */
  price_yearly_amount: string;
  currency: string;
  billing_period: 'month' | 'year' | 'lifetime' | '';
  max_products: number | null;
  max_orders_per_month: number | null;
  max_customers: number | null;
  /** Membres de la boutique, propriétaire compris. */
  max_members: number | null;
  /** Lectures avancées du scan d'emballage par mois (`null` : illimité). */
  max_text_scans_per_month: number | null;
  features_json: string[];
  is_active: boolean;
}

/** Compteurs des jauges d'usage (`shop_usage` côté backend). */
export type UsageKey = 'products' | 'orders_this_month' | 'customers' | 'members';

export interface UsageCounter {
  count: number;
  /** `null` : illimité dans la formule effective. */
  limit: number | null;
}

export type BillingInterval = 'month' | 'year';

export interface ScheduledChange {
  plan: PlanCode;
  interval: BillingInterval | '';
  at: string | null;
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
   * Découverte — le frontend doit donc gater sur `effective_plan_code`, pas
   * sur `plan.code`.
   */
  effective_plan_code: PlanCode;
  days_remaining: number | null;
  /** Usage de la boutique face aux limites de la formule effective. */
  usage: Record<UsageKey, UsageCounter>;
  /** Lectures avancées du scan d'emballage disponibles (fournisseur IA configuré côté serveur). */
  ai_reads_enabled: boolean;
  /** Lectures avancées du mois, face au plafond de la formule effective ; `null` si indisponibles. */
  ai_reads: UsageCounter | null;
  /** Rythme de l'abonnement Stripe ; vide hors abonnement Stripe. */
  billing_interval: BillingInterval | '';
  /** Début du retard de paiement (statut `past_due`), sinon `null`. */
  past_due_since: string | null;
  /** Fin du délai de grâce : l'accès est conservé jusque-là, puis l'abonnement est résilié. */
  grace_ends_at: string | null;
  /** Fin de l'essai Mizan ; `null` hors essai. */
  trial_ends_at: string | null;
  /** Abonnement payé par Stripe (souscrit par le paiement en ligne). */
  stripe_managed: boolean;
  /** Compte de facturation existant : le portail de paiement peut s'ouvrir. */
  has_billing_customer: boolean;
  /** Propriétaire de la boutique : seul à pouvoir souscrire, résilier ou ouvrir le portail. */
  can_manage: boolean;
  /** Paiement en ligne ouvert côté serveur. */
  billing_enabled: boolean;
  /** Changement de formule programmé en fin de période. */
  scheduled_change: ScheduledChange | null;
  created_at: string;
  updated_at: string;
}

/** Grille des formules actives, triée par prix (catalogue commun à toutes les boutiques). */
export function usePlans() {
  return useQuery({
    queryKey: qk.subscription.plans,
    queryFn: () => apiFetch<SubscriptionPlan[]>('/subscriptions/plans/'),
    staleTime: Infinity,
  });
}

export const subscriptionQuery = {
  queryKey: qk.subscription.current,
  queryFn: () => apiFetch<Subscription>('/subscriptions/current/'),
};

export function useSubscription() {
  return useQuery(subscriptionQuery);
}

/**
 * Retour immédiat sur Découverte (`POST /api/subscriptions/change/`), pour une boutique
 * sans abonnement Stripe (essai, formule attribuée). Un abonnement Stripe se résilie
 * par `useCancelSubscription` (`lib/hooks/useBilling.ts`), en fin de période.
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
