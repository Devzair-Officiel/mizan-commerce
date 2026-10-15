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

const TIER_ORDER: readonly PlanCode[] = ['free', 'solo', 'boutique', 'commerce_plus'] as const;

/** Certaines clés n'ont pas encore de code : elles servent la grille (`features_json`). */
const FEATURE_MIN_PLAN = {
  products: 'free',
  stock: 'free',
  notes: 'free',
  reminders: 'free',
  orders: 'free',
  zakat: 'free',
  invoices: 'solo',
  whatsapp: 'solo',
  zakat_history: 'solo',
  auto_reminders: 'solo',
  multi_user: 'boutique',
  roles_permissions: 'boutique',
  invoice_branding: 'boutique',
  message_templates: 'boutique',
  daily_digest: 'boutique',
  sales_stats: 'boutique',
  exports: 'boutique',
  public_pages: 'boutique',
  loyalty: 'boutique',
  ocr: 'boutique',
  visual_inventory: 'boutique',
  qr_codes: 'boutique',
  partnerships: 'boutique',
  audit_log: 'commerce_plus',
  priority_support: 'commerce_plus',
} as const satisfies Record<string, PlanCode>;

export type Feature = keyof typeof FEATURE_MIN_PLAN;

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
