'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BillingPeriodToggle } from '@/components/subscription/BillingPeriodToggle';
import { PlanCard, type PlanCardState } from '@/components/subscription/PlanCard';
import { PlanTabs } from '@/components/subscription/PlanTabs';
import type { PlanCode, Subscription, SubscriptionPlan } from '@/lib/hooks/useSubscription';
import { freeMonthsPerYear, RECOMMENDED_PLAN, type BillingPeriod } from '@/lib/plan-pricing';

interface PlanPickerProps {
  plans: SubscriptionPlan[];
  subscription: Subscription;
  isTrial: boolean;
  onChoosePlan: (code: PlanCode, period: BillingPeriod) => void;
}

/** « Choisir une formule » : 4 cartes ou 2 × 2 selon le conteneur desktop, une par onglet sur mobile. */
export function PlanPicker({ plans, subscription, isTrial, onChoosePlan }: PlanPickerProps) {
  const t = useTranslations('settings.subscription');
  const current = subscription.effective_plan_code;
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const [tab, setTab] = useState<PlanCode>(current === 'free' ? RECOMMENDED_PLAN : current);
  const stateOf = (code: PlanCode): PlanCardState => (code !== current ? 'other' : isTrial ? 'trial' : 'current');

  return (
    <section aria-labelledby="choose-plan-title" className="@container/plans flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="choose-plan-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('choose_title')}</h2>
        <BillingPeriodToggle value={period} onChange={setPeriod} freeMonths={freeMonthsPerYear(plans)} />
      </div>
      <PlanTabs codes={plans.map((plan) => plan.code)} active={tab} onChange={setTab} />
      <div className="grid gap-4 lg:grid-cols-2 @[880px]/plans:grid-cols-4">
        {plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} period={period} state={stateOf(plan.code)} status={subscription.status}
            recommended={plan.code === RECOMMENDED_PLAN} hiddenOnMobile={plan.code !== tab} onChoose={onChoosePlan} />
        ))}
      </div>
    </section>
  );
}
