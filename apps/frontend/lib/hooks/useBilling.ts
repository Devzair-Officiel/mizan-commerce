import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { BillingInterval, PlanCode, Subscription } from '@/lib/hooks/useSubscription';

/**
 * Paiement en ligne (Stripe) de la page Abonnement. Le serveur crée les sessions Stripe et
 * renvoie leur adresse : aucune clé ni aucun identifiant Stripe ne passe par le navigateur.
 * Réservé au propriétaire (`can_manage`) ; tout succès relit l'abonnement.
 */

/** Messages traduits des erreurs de facturation (`settings.subscription.errors.{clé}`). */
export type BillingErrorKey =
  | 'already_subscribed' | 'unavailable' | 'throttled'
  | 'checkout_failed' | 'portal_failed' | 'cancel_failed' | 'resume_failed';

/** Code stable renvoyé par le serveur (`BillingError` : `{detail, code}`) ; jamais le message brut. */
export function billingErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || typeof error.data !== 'object' || error.data === null) return null;
  const code = (error.data as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

const CODE_KEYS: Partial<Record<string, BillingErrorKey>> = {
  already_subscribed: 'already_subscribed',
  billing_disabled: 'unavailable',
  catalog_not_synced: 'unavailable',
};

/** Erreur → clé de traduction : code connu, sinon statut (503 indisponible, 429 sans code), sinon `fallback`. */
export function billingErrorKey(error: unknown, fallback: BillingErrorKey): BillingErrorKey {
  const key = CODE_KEYS[billingErrorCode(error) ?? ''];
  if (key) return key;
  if (error instanceof ApiError && error.status === 503) return 'unavailable';
  if (error instanceof ApiError && error.status === 429) return 'throttled';
  return fallback;
}

/** Relit l'abonnement affiché (après un succès, ou un refus de `PLAN_CHANGE_RESYNC`). */
export function useInvalidateSubscription() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.subscription.all });
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

/** Adresse d'une page Stripe, à passer telle quelle à `redirectToStripe` (qui la vérifie). */
interface StripeSession {
  url: unknown;
}

/** Session de paiement d'une formule (page checkout.stripe.com). */
export function useStartCheckout() {
  const onSuccess = useInvalidateSubscription();
  return useMutation({
    mutationFn: (vars: { plan: PlanCode; interval: BillingInterval }) => post<StripeSession>('/subscriptions/checkout/', vars),
    onSuccess,
  });
}

/** Portail client : moyen de paiement et factures (page billing.stripe.com). */
export function useOpenPortal() {
  const onSuccess = useInvalidateSubscription();
  return useMutation({ mutationFn: () => post<StripeSession>('/subscriptions/portal/'), onSuccess });
}

/** Résiliation : en fin de période payée ; immédiate en retard de paiement. */
export function useCancelSubscription() {
  const onSuccess = useInvalidateSubscription();
  return useMutation({ mutationFn: () => post<Subscription>('/subscriptions/cancel/'), onSuccess });
}

/** Annule la résiliation programmée. */
export function useResumeSubscription() {
  const onSuccess = useInvalidateSubscription();
  return useMutation({ mutationFn: () => post<Subscription>('/subscriptions/resume/'), onSuccess });
}

/** Relit l'abonnement chez Stripe (retour de paiement, état changé entre-temps). */
export function useRefreshSubscription() {
  const onSuccess = useInvalidateSubscription();
  return useMutation({ mutationFn: () => post<Subscription>('/subscriptions/refresh/'), onSuccess });
}

// ── Changement de formule d'un abonnement Stripe ────────────────────────────────────────────

export type PaidPlanCode = Exclude<PlanCode, 'free'>;

/** Formule et rythme visés par un changement. */
export interface PlanChoice {
  plan: PaidPlanCode;
  interval: BillingInterval;
}

/** Plafond de la formule visée que l'usage actuel dépasse déjà (`members` : propriétaire compris). */
export interface OverLimit {
  resource: 'products' | 'orders_this_month' | 'customers' | 'members';
  usage: number;
  limit: number;
}

/**
 * Aperçu chiffré du serveur (`POST /subscriptions/change-preview/`) : rien n'est débité.
 * `amount_due_now` et `proration_date` se renvoient tels quels pour confirmer (jamais recalculés).
 */
export interface PlanChangePreview {
  /** Montée : payée tout de suite, au prorata ; descente ou passage au mensuel : en fin de période. */
  kind: 'immediate' | 'scheduled';
  current: { plan: PlanCode; interval: BillingInterval | '' };
  target: PlanChoice;
  /** Montant décimal (« 12.34 ») ; « 0.00 » pour un changement programmé. */
  amount_due_now: string;
  currency: string;
  proration_date: number;
  effective_at: string | null;
  next_renewal: { amount: string; date: string | null };
  lost_features: string[];
  over_limits: OverLimit[];
}

const AMOUNT = /^\d{1,10}\.\d{2}$/;

/** Forme minimale d'un aperçu reçu dans une erreur 409 (`amount_changed`), avant de l'afficher. */
function isPlanChangePreview(value: unknown): value is PlanChangePreview {
  if (typeof value !== 'object' || value === null) return false;
  const preview = value as Partial<Record<keyof PlanChangePreview, unknown>>;
  return (preview.kind === 'immediate' || preview.kind === 'scheduled')
    && typeof preview.amount_due_now === 'string' && AMOUNT.test(preview.amount_due_now)
    && typeof preview.proration_date === 'number' && typeof preview.currency === 'string'
    && typeof preview.target === 'object' && preview.target !== null
    && typeof preview.next_renewal === 'object' && preview.next_renewal !== null
    && Array.isArray(preview.lost_features) && Array.isArray(preview.over_limits);
}

/** Nouvel aperçu joint à un refus `amount_changed` (montant changé ou aperçu expiré), sinon `null`. */
export function amountChangedPreview(error: unknown): PlanChangePreview | null {
  if (billingErrorCode(error) !== 'amount_changed' || !(error instanceof ApiError)) return null;
  const preview = (error.data as { preview?: unknown }).preview;
  return isPlanChangePreview(preview) ? preview : null;
}

/** Messages traduits du changement de formule (`settings.subscription.change.errors.{clé}`). */
export type PlanChangeErrorKey =
  | 'payment_failed' | 'change_not_supported' | 'payment_overdue' | 'cancellation_scheduled'
  | 'no_change' | 'use_checkout' | 'nothing_scheduled' | 'unavailable' | 'owner_only' | 'throttled'
  | 'change_failed' | 'cancel_change_failed';

const PLAN_CHANGE_CODES: Partial<Record<string, PlanChangeErrorKey>> = {
  payment_failed: 'payment_failed',
  payment_action_required: 'payment_failed',
  change_not_supported: 'change_not_supported',
  payment_overdue: 'payment_overdue',
  cancellation_scheduled: 'cancellation_scheduled',
  no_change: 'no_change',
  use_checkout_or_change_plan: 'use_checkout',
  nothing_scheduled: 'nothing_scheduled',
  billing_disabled: 'unavailable',
  catalog_not_synced: 'unavailable',
};

const PLAN_CHANGE_STATUSES: Partial<Record<number, PlanChangeErrorKey>> = { 403: 'owner_only', 429: 'throttled', 503: 'unavailable' };

/**
 * Refus qui signalent un abonnement affiché périmé : le serveur vient de le relire chez Stripe,
 * il suffit de relire `/subscriptions/current/` (sans `refresh/`, dont le quota est celui des aperçus).
 */
export const PLAN_CHANGE_RESYNC: ReadonlySet<PlanChangeErrorKey> = new Set([
  'payment_overdue', 'cancellation_scheduled', 'no_change', 'use_checkout', 'nothing_scheduled',
]);

/** Erreur → clé de traduction : code connu, sinon statut, sinon `fallback` ; jamais le message brut. */
export function planChangeErrorKey(error: unknown, fallback: PlanChangeErrorKey = 'change_failed'): PlanChangeErrorKey {
  const key = PLAN_CHANGE_CODES[billingErrorCode(error) ?? ''];
  if (key) return key;
  return (error instanceof ApiError && PLAN_CHANGE_STATUSES[error.status]) || fallback;
}

/**
 * Un seul aperçu par ouverture de la fenêtre (quota serveur de 30 par heure) : ni nouvel essai
 * automatique, ni relecture au retour sur l'onglet, à la reconnexion ou à intervalle ; oublié à la
 * fermeture. Un nouvel aperçu ne se demande que par `refetch()` (« Réessayer ») ou arrive avec un 409.
 * Refus de `PLAN_CHANGE_RESYNC` : l'abonnement affiché est relu.
 */
export function usePlanChangePreview(choice: PlanChoice) {
  const resync = useInvalidateSubscription();
  return useQuery({
    queryKey: qk.billing.changePreview(choice.plan, choice.interval),
    queryFn: async () => {
      try {
        return await post<PlanChangePreview>('/subscriptions/change-preview/', choice);
      } catch (error) {
        if (PLAN_CHANGE_RESYNC.has(planChangeErrorKey(error))) void resync();
        throw error;
      }
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
}

/** Remplace l'aperçu affiché par celui du serveur (refus `amount_changed`), sans nouvelle requête. */
export function useReplacePlanChangePreview() {
  const qc = useQueryClient();
  return (preview: PlanChangePreview) => qc.setQueryData(qk.billing.changePreview(preview.target.plan, preview.target.interval), preview);
}

/** Confirme l'aperçu : montant et date de prorata renvoyés tels que reçus ; l'abonnement à jour en retour. */
export function useApplyPlanChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preview: PlanChangePreview) => post<Subscription>('/subscriptions/change/', {
      plan: preview.target.plan,
      interval: preview.target.interval,
      expected_amount: preview.amount_due_now,
      proration_date: preview.proration_date,
    }),
    onSuccess: (subscription) => qc.setQueryData(qk.subscription.current, subscription),
  });
}

/** Annule le changement programmé : la formule actuelle se renouvelle. */
export function useCancelScheduledChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<Subscription>('/subscriptions/scheduled-change/cancel/'),
    onSuccess: (subscription) => qc.setQueryData(qk.subscription.current, subscription),
  });
}
