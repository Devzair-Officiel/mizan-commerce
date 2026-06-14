/**
 * Gating frontend par formule d'abonnement.
 *
 * Miroir client de `apps/subscriptions/permissions.py` (FEATURE_MIN_PLAN).
 * UX seulement — la sécurité réelle reste côté serveur, qui répond 403 si la
 * formule ne couvre pas la feature. Ce hook sert à masquer / désactiver les
 * entrées de menu et CTA pour éviter qu'un utilisateur free clique sur des
 * features payantes.
 *
 * Gate sur `effective_plan_code` (et non `plan.code`) pour rester aligné avec
 * le gating backend pendant la fenêtre trial-expiré-mais-pas-encore-reconcilié.
 */

import { useSubscription, type PlanCode } from './useSubscription';

const TIER_ORDER: readonly PlanCode[] = ['free', 'pro', 'boutique_plus'] as const;

export type Feature =
  | 'products'
  | 'stock'
  | 'notes'
  | 'reminders'
  | 'orders'
  | 'invoices'
  | 'zakat'
  | 'whatsapp'
  | 'public_pages'
  | 'partnerships'
  | 'multi_user'
  | 'exports'
  | 'ocr';

const FEATURE_MIN_PLAN: Record<Feature, PlanCode> = {
  products: 'free',
  stock: 'free',
  notes: 'free',
  reminders: 'free',
  orders: 'pro',
  invoices: 'pro',
  zakat: 'pro',
  whatsapp: 'pro',
  public_pages: 'boutique_plus',
  partnerships: 'boutique_plus',
  multi_user: 'boutique_plus',
  exports: 'boutique_plus',
  ocr: 'boutique_plus',
};

function tierIndex(code: PlanCode): number {
  return TIER_ORDER.indexOf(code);
}

export function hasFeature(planCode: PlanCode, feature: Feature): boolean {
  const required = FEATURE_MIN_PLAN[feature];
  return tierIndex(planCode) >= tierIndex(required);
}

/**
 * Hook React : renvoie un prédicat `can(feature)` basé sur la souscription
 * courante. Pendant le chargement, on est *optimiste* (renvoie `true`) pour
 * éviter un flash de menus masqués au premier rendu — le serveur refusera
 * de toute façon si la formule ne couvre pas la feature.
 */
export function usePlanGating() {
  const { data: subscription, isLoading } = useSubscription();

  function can(feature: Feature): boolean {
    if (isLoading || !subscription) return true;
    return hasFeature(subscription.effective_plan_code, feature);
  }

  return {
    can,
    planCode: subscription?.effective_plan_code ?? null,
    isLoading,
  };
}
