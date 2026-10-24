'use client';

/**
 * Page Settings → Abonnement : votre formule, votre activité, choix d'une formule, résiliation.
 *
 * Souscription : un CTA de la grille ouvre le récapitulatif (`CheckoutSummary`), qui quitte
 * l'application vers la page de paiement Stripe ; au retour (`?checkout=…`), `CheckoutReturn`
 * attend la confirmation du serveur. Un abonnement Stripe se gère depuis « Votre formule »
 * (portail, reprise, impayé) ; le changement de formule payante arrive au lot 5b.
 *
 * Prix et limites viennent de l'API (`/subscriptions/plans/`) ; noms, descriptions
 * et lignes de fonctions de l'i18n (`settings.subscription.plans.{code}`).
 */

import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { CancelPlan } from '@/components/subscription/CancelPlan';
import { CheckoutReturn } from '@/components/subscription/CheckoutReturn';
import { CheckoutSummary } from '@/components/subscription/CheckoutSummary';
import { CurrentPlanCard } from '@/components/subscription/CurrentPlanCard';
import { PlanActivity } from '@/components/subscription/PlanActivity';
import { PlanPicker, type PlanPickerLock } from '@/components/subscription/PlanPicker';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { usePlans, useSubscription, type PlanCode, type Subscription } from '@/lib/hooks/useSubscription';
import type { BillingPeriod } from '@/lib/plan-pricing';

/** CTA de la grille inactifs : réservés au propriétaire ; abonnement Stripe déjà en place (lot 5b). */
function planLock(subscription: Subscription): PlanPickerLock | null {
  if (!subscription.can_manage) return 'owner_only';
  return subscription.stripe_managed ? 'change_soon' : null;
}

export default function SubscriptionPage() {
  const t = useTranslations('settings.subscription');
  const subscription = useSubscription();
  const plans = usePlans();
  const [choice, setChoice] = useState<{ code: PlanCode; period: BillingPeriod } | null>(null);
  const sub = subscription.data;
  const grid = plans.data;
  const chosen = choice && grid?.find((plan) => plan.code === choice.code);
  const isTrial = sub?.status === 'trialing' && !sub.is_trial_expired && sub.effective_plan_code !== 'free';
  const onChoosePlan = (code: PlanCode, period: BillingPeriod) => setChoice({ code, period });

  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar hideSearch title={t('title')} />
      {(subscription.isLoading || plans.isLoading) && <SectionsSkeleton sections={[3, 4, 5]} className="px-4 pt-4 pb-32" />}
      {(subscription.isError || plans.isError) && (
        <div role="alert" className="flex flex-col items-start gap-3 p-5 text-sm">
          <p>{t('load_error')}</p>
          <button type="button" onClick={() => { subscription.refetch(); plans.refetch(); }}
            className="min-h-11 font-semibold text-primary underline active:scale-[0.98]">{t('retry')}</button>
        </div>
      )}
      {sub && grid && (
        <div className="flex flex-col gap-6 px-4 pt-4 pb-32">
          <Suspense fallback={null}><CheckoutReturn /></Suspense>
          <CurrentPlanCard subscription={sub} plan={grid.find((plan) => plan.code === sub.effective_plan_code)}
            isTrial={isTrial} onChoosePlan={onChoosePlan} />
          <PlanActivity subscription={sub} freePlan={grid.find((plan) => plan.code === 'free')} />
          <PlanPicker plans={grid} subscription={sub} isTrial={isTrial} lock={planLock(sub)} onChoosePlan={onChoosePlan} />
          {sub.effective_plan_code !== 'free' && <CancelPlan subscription={sub} />}
        </div>
      )}
      {chosen && sub && (
        <UpgradeSheet open onClose={() => setChoice(null)} title={t('checkout_title', { name: t(`plans.${chosen.code}.name`) })}>
          <CheckoutSummary plan={chosen} period={choice.period} subscription={sub} isTrial={isTrial} onClose={() => setChoice(null)} />
        </UpgradeSheet>
      )}
    </div>
  );
}
