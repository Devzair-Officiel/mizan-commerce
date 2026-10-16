'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { featureMinPlan } from '@/lib/hooks/usePlanGating';
import { useSubscription, type PlanCode, type UsageKey } from '@/lib/hooks/useSubscription';

/** Fonctions d'une formule supérieure. */
export type LockedFeature =
  | 'multi_user' | 'public_pages' | 'ocr' | 'whatsapp' | 'exports' | 'invoices' | 'invoice_branding';
/** Fonction verrouillée, ou compteur arrivé à la limite de la formule. */
export type UpgradeFeature = LockedFeature | UsageKey;

/** Formule à proposer : celle qui ouvre la fonction, ou celle qui lève la limite atteinte. */
function targetPlan(feature: UpgradeFeature, current: PlanCode | undefined): PlanCode {
  switch (feature) {
    case 'members': return current === 'boutique' ? 'commerce_plus' : 'boutique';
    case 'products': case 'orders_this_month': case 'customers': return 'solo';
    default: return featureMinPlan(feature);
  }
}

/** Carte de mise à niveau : le bénéfice de la formule, et le chemin vers Paramètres › Abonnement. */
export function UpgradeCard({ feature }: { feature: UpgradeFeature }) {
  const t = useTranslations('settings.upgrade');
  const kind = useCatalogKind();
  const plan = targetPlan(feature, useSubscription().data?.effective_plan_code);
  const values = { feature, plan, kind };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-secondary text-primary flex items-center justify-center">
        <Sparkles size={20} aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-foreground">{t('title', values)}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t('text', values)}</p>
      <Link href="/settings/subscription" className={`${buttonVariants({ variant: 'default' })} mt-2 h-11 whitespace-nowrap px-5 active:scale-[0.98]`}>
        {t('cta')}
      </Link>
    </div>
  );
}
