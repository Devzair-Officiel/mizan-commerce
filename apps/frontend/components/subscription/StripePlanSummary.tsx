'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { BillingNotice } from '@/components/subscription/BillingNotice';
import { ScheduledChangeNotice } from '@/components/subscription/ScheduledChangeNotice';
import { Button } from '@/components/ui/button';
import {
  billingErrorCode, billingErrorKey, useRefreshSubscription, useResumeSubscription, type BillingErrorKey,
} from '@/lib/hooks/useBilling';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { usePortalRedirect } from '@/lib/hooks/usePortalRedirect';
import type { Subscription, SubscriptionPlan } from '@/lib/hooks/useSubscription';
import { planPrice } from '@/lib/plan-pricing';

/** Portail de paiement et reprise de l'abonnement, avec leur erreur traduite. */
function useStripeActions() {
  const portal = usePortalRedirect();
  const resume = useResumeSubscription();
  const { mutate: resync } = useRefreshSubscription();
  const [resumeError, setResumeError] = useState<BillingErrorKey | null>(null);

  async function keep() {
    setResumeError(null);
    try {
      await resume.mutateAsync();
    } catch (err) {
      // Plus rien à reprendre (déjà repris, ou résilié entre-temps) : on relit l'état.
      if (billingErrorCode(err) === 'nothing_to_resume') resync();
      else setResumeError(billingErrorKey(err, 'resume_failed'));
    }
  }

  return { openPortal: portal.open, keep, portalBusy: portal.busy, resumeBusy: resume.isPending, error: portal.error ?? resumeError };
}

interface StripePlanSummaryProps {
  subscription: Subscription;
  /** Formule en vigueur, lue dans la grille (montant selon le rythme). */
  plan: SubscriptionPlan | undefined;
}

/**
 * « Votre formule » d'un abonnement Stripe : formule et rythme, prochain renouvellement,
 * portail de paiement ; bandeau de résiliation programmée (reprise), de paiement échoué ou de
 * changement de formule programmé (annulable ; il remplace la ligne de renouvellement).
 */
export function StripePlanSummary({ subscription, plan }: StripePlanSummaryProps) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();
  const { openPortal, keep, portalBusy, resumeBusy, error } = useStripeActions();
  const interval = subscription.billing_interval || 'month';
  const date = (iso: string | null) => (iso ? formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const amount = plan ? formatMoney(planPrice(plan, interval), plan.currency, { maximumFractionDigits: 0 }) : '';
  const pastDue = subscription.status === 'past_due';
  const scheduled = subscription.cancel_at_period_end && !pastDue;
  const change = pastDue || scheduled ? null : subscription.scheduled_change;
  const manage = subscription.can_manage;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xl font-semibold text-foreground">{t(`plans.${subscription.effective_plan_code}.name`)}</p>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground" data-billing-interval={interval}>
            {t('period', { period: interval })}
          </span>
        </div>
        {!pastDue && !scheduled && !change && subscription.current_period_end && (
          <p className="text-sm tabular-nums text-muted-foreground" data-renewal>{t('renewal_line', { date: date(subscription.current_period_end), amount })}</p>
        )}
      </div>
      {scheduled && (
        <BillingNotice kind="cancel_scheduled" text={t('cancel_scheduled', { date: date(subscription.current_period_end) })}
          action={manage ? { label: t('resume_cta'), onClick: keep, pending: resumeBusy } : undefined} />
      )}
      {change && <ScheduledChangeNotice subscription={subscription} change={change} />}
      {pastDue && (
        <BillingNotice kind="past_due" text={t('past_due', { date: date(subscription.grace_ends_at) })}
          hint={manage ? undefined : t('past_due_owner')}
          action={manage ? { label: t('past_due_cta'), onClick: openPortal, pending: portalBusy } : undefined} />
      )}
      {manage && !pastDue && subscription.has_billing_customer && (
        <Button type="button" variant="outline" onClick={openPortal} disabled={portalBusy} aria-busy={portalBusy}
          className="h-11 self-start rounded-full px-5 active:scale-[0.98]">
          {portalBusy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {t('portal_cta')}
        </Button>
      )}
      {!manage && !pastDue && <p className="text-xs text-muted-foreground">{t('owner_only')}</p>}
      {error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{t(`errors.${error}`)}</p>}
    </div>
  );
}
