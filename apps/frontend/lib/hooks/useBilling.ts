import { useMutation, useQueryClient } from '@tanstack/react-query';
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

function useInvalidateSubscription() {
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
