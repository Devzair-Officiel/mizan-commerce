'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { billingErrorKey, useRefreshSubscription, useStartCheckout, type BillingErrorKey } from '@/lib/hooks/useBilling';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Subscription, SubscriptionPlan } from '@/lib/hooks/useSubscription';
import { planPrice, type BillingPeriod } from '@/lib/plan-pricing';
import { redirectToStripe } from '@/lib/stripe-redirect';

interface CheckoutSummaryProps {
  plan: SubscriptionPlan;
  period: BillingPeriod;
  subscription: Subscription;
  isTrial: boolean;
  onClose: () => void;
}

/**
 * Avant le paiement : formule, prix et période, renouvellement automatique (et fin de l'essai),
 * puis « Continuer vers le paiement sécurisé », qui quitte l'application vers la page Stripe.
 */
export function CheckoutSummary({ plan, period, subscription, isTrial, onClose }: CheckoutSummaryProps) {
  const t = useTranslations('settings.subscription');
  const formatMoney = useFormatMoney();
  const checkout = useStartCheckout();
  const refresh = useRefreshSubscription();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<BillingErrorKey | null>(subscription.billing_enabled ? null : 'unavailable');
  const busy = checkout.isPending || leaving;
  const blocked = !subscription.can_manage || error === 'unavailable' || error === 'already_subscribed';

  async function start() {
    setError(null);
    try {
      const { url } = await checkout.mutateAsync({ plan: plan.code, interval: period });
      redirectToStripe(url, 'checkout');
      setLeaving(true);
    } catch (err) {
      const key = billingErrorKey(err, 'checkout_failed');
      // Abonnement déjà en place (autre onglet, webhook en avance) : la page se remet à jour.
      if (key === 'already_subscribed') refresh.mutate();
      setError(key);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-checkout-summary>
      <div className="flex flex-col gap-1 rounded-2xl bg-muted p-4">
        <p className="text-sm font-semibold text-foreground">{t(`plans.${plan.code}.name`)}</p>
        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {formatMoney(planPrice(plan, period), plan.currency, { maximumFractionDigits: 0 })}
          </span>
          <span className="text-sm text-muted-foreground">{t('per', { period })}</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">{t('checkout_renewal', { period })}</p>
      {isTrial && <p className="text-sm font-medium text-amber-700 dark:text-amber-400" data-checkout-trial>{t('checkout_trial_ends')}</p>}
      {!subscription.can_manage && <p className="text-sm text-muted-foreground">{t('owner_only')}</p>}
      {error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{t(`errors.${error}`)}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} className="h-11 rounded-full px-5 active:scale-[0.98]">
          {t('checkout_back')}
        </Button>
        <Button type="button" onClick={start} disabled={busy || blocked} aria-busy={busy}
          className="h-11 rounded-full px-5 active:scale-[0.98]">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {t('checkout_cta')}
        </Button>
      </div>
    </div>
  );
}
