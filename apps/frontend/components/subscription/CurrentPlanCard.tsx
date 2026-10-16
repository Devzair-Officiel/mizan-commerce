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

/** Barre d'essai en ambre, « Jour 3 sur 14 » dessous et la date de fin en regard. */
function TrialBar({ day, total, end }: { day: number; total: number; end: string }) {
  const t = useTranslations('settings.subscription');
  const labelId = useId();
  return (
    <div className="flex max-w-96 flex-col gap-1.5" data-trial-bar>
      <div role="progressbar" aria-labelledby={labelId} aria-valuenow={day} aria-valuemin={1} aria-valuemax={total}
        className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-amber-500 dark:bg-amber-400" style={{ width: `${Math.round((day / total) * 100)}%` }} />
      </div>
      <div className="flex justify-between gap-3 text-xs tabular-nums text-muted-foreground">
        <span id={labelId}>{t('trial_day', { day, total })}</span>
        <span>{end}</span>
      </div>
    </div>
  );
}

/**
 * « Votre formule », pleine largeur : nom, essai en cours ou formule active ; en essai, la barre ambre
 * et le seul CTA « Garder Boutique », à droite sur desktop, sous le texte sur mobile.
 */
export function CurrentPlanCard({ subscription, plan, isTrial, onChoosePlan }: CurrentPlanCardProps) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();
  const code = subscription.effective_plan_code;
  const name = t(`plans.${code}.name`);
  const price = plan ? formatMoney(plan.price_amount, plan.currency, { maximumFractionDigits: 0 }) : '';
  const end = subscription.current_period_end;
  const progress = isTrial ? trialProgress(subscription) : null;
  const showCta = isTrial && plan;

  return (
    <SectionCard title={t('current_plan')}>
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8" data-current-plan={code}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
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
          {progress && end && (
            <div className="mt-3"><TrialBar {...progress} end={formatDate(end, { day: 'numeric', month: 'short' })} /></div>
          )}
          {!showCta && code !== 'free' && <p className="mt-2 text-xs text-muted-foreground">{t('no_commitment')}</p>}
        </div>
        {showCta && (
          <div className="flex flex-col gap-2 text-center lg:w-72 lg:shrink-0">
            <Button type="button" onClick={() => onChoosePlan(code, 'month')} className="h-11 w-full rounded-full px-5 active:scale-[0.98]">
              {t('keep_cta', { name, price })}
            </Button>
            <p className="text-xs text-muted-foreground">{t('no_commitment')}</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
