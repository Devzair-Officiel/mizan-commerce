'use client';

/**
 * Page Settings → Abonnement : votre formule, votre activité, choix d'une formule, résiliation.
 *
 * Tant que Stripe n'est pas branché, tous les CTA de souscription passent par `onChoosePlan`,
 * qui ouvre une fenêtre « paiement pas encore activé » sans appeler le serveur ; le backend
 * refuse de toute façon tout passage à une formule payante (`POST /subscriptions/change/`).
 *
 * Prix et limites viennent de l'API (`/subscriptions/plans/`) ; noms, descriptions
 * et lignes de fonctions de l'i18n (`settings.subscription.plans.{code}`).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { CancelPlan } from '@/components/subscription/CancelPlan';
import { CurrentPlanCard } from '@/components/subscription/CurrentPlanCard';
import { PlanActivity } from '@/components/subscription/PlanActivity';
import { PlanPicker } from '@/components/subscription/PlanPicker';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import { Button } from '@/components/ui/button';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { usePlans, useSubscription, type PlanCode } from '@/lib/hooks/useSubscription';
import { planPrice, type BillingPeriod } from '@/lib/plan-pricing';

/** Contenu de la fenêtre ouverte par un CTA de souscription, tant que le paiement n'est pas branché. */
function PaymentPending({ onClose }: { onClose: () => void }) {
  const t = useTranslations('settings.subscription');
  return (
    <div className="flex flex-col items-center gap-4 text-center" data-payment-pending>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
        <CreditCard size={20} aria-hidden />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{t('payment_pending')}</p>
      <Button type="button" onClick={onClose} className="h-11 rounded-full px-6 text-sm active:scale-[0.98]">{t('payment_ok')}</Button>
    </div>
  );
}

export default function SubscriptionPage() {
  const t = useTranslations('settings.subscription');
  const formatMoney = useFormatMoney();
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
      <TopBar title={t('title')} />
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
          <CurrentPlanCard subscription={sub} plan={grid.find((plan) => plan.code === sub.effective_plan_code)}
            isTrial={isTrial} onChoosePlan={onChoosePlan} />
          <PlanActivity subscription={sub} freePlan={grid.find((plan) => plan.code === 'free')} />
          <PlanPicker plans={grid} subscription={sub} isTrial={isTrial} onChoosePlan={onChoosePlan} />
          {sub.effective_plan_code !== 'free' && <CancelPlan />}
        </div>
      )}
      {chosen && (
        <UpgradeSheet open onClose={() => setChoice(null)} title={t('checkout_title', {
          name: t(`plans.${chosen.code}.name`),
          price: formatMoney(planPrice(chosen, choice.period), chosen.currency, { maximumFractionDigits: 0 }),
          period: choice.period,
        })}>
          <PaymentPending onClose={() => setChoice(null)} />
        </UpgradeSheet>
      )}
    </div>
  );
}
