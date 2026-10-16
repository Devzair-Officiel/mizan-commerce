'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ui/SectionCard';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { PlanCode, Subscription, SubscriptionPlan } from '@/lib/hooks/useSubscription';
import { trialProgress, type BillingPeriod } from '@/lib/plan-pricing';

interface CurrentPlanCardProps {
  subscription: Subscription;
  /** Formule en vigueur, lue dans la grille (prix). */
  plan: SubscriptionPlan | undefined;
  isTrial: boolean;
  onChoosePlan: (code: PlanCode, period: BillingPeriod) => void;
}

/** « Jour 3 sur 14 » et sa barre. */
function TrialBar({ day, total }: { day: number; total: number }) {
  const t = useTranslations('settings.subscription');
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p id={labelId} className="text-[0.8125rem] font-medium tabular-nums text-foreground">{t('trial_day', { day, total })}</p>
      <div role="progressbar" aria-labelledby={labelId} aria-valuenow={day} aria-valuemin={1} aria-valuemax={total}
        className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((day / total) * 100)}%` }} />
      </div>
    </div>
  );
}

/** « Votre formule » : nom, essai en cours ou formule active, et en essai le seul CTA « Garder Boutique ». */
export function CurrentPlanCard({ subscription, plan, isTrial, onChoosePlan }: CurrentPlanCardProps) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();
  const code = subscription.effective_plan_code;
  const name = t(`plans.${code}.name`);
  const price = plan ? formatMoney(plan.price_amount, plan.currency, { maximumFractionDigits: 0 }) : '';
  const end = subscription.current_period_end;
  const progress = isTrial ? trialProgress(subscription) : null;

  return (
    <SectionCard title={t('current_plan')}>
      <div className="flex flex-col gap-4 p-5" data-current-plan={code}>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold text-foreground">{name}</p>
            {isTrial && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                {t('trial')}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">
            {isTrial && end
              ? t('trial_left', { days: Math.max(0, subscription.days_remaining ?? 0), date: formatDate(end, { day: 'numeric', month: 'long', year: 'numeric' }) })
              : code === 'free' ? t('free_forever') : t('plan_active', { name, price })}
          </p>
        </div>
        {progress && <TrialBar {...progress} />}
        {isTrial && plan && (
          <Button type="button" onClick={() => onChoosePlan(code, 'month')}
            className="h-11 w-full rounded-full px-5 active:scale-[0.98] sm:w-auto sm:self-start">
            {t('keep_cta', { name, price })}
          </Button>
        )}
        {code !== 'free' && <p className="text-xs text-muted-foreground">{t('no_commitment')}</p>}
      </div>
    </SectionCard>
  );
}
