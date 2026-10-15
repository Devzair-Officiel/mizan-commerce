'use client';

/**
 * Page Settings → Abonnement.
 *
 * Tant que Stripe n'est pas branché, deux scénarios pratiques :
 * - Essai actif (Boutique) → CTA "Résilier" qui bascule sur Découverte.
 * - Formule payante → CTA "Résilier" idem (retour sur Découverte).
 *
 * Les boutons de passage à une formule payante sont volontairement désactivés
 * (label "Bientôt disponible") — l'endpoint backend rejette toute autre
 * mutation que `plan_code: 'free'`.
 *
 * Prix et limites viennent de l'API (`/subscriptions/plans/`) ; noms, descriptions
 * et lignes de fonctions de l'i18n (`settings.subscription.plans.{code}`).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import {
  useSubscription,
  useDowngradeToFree,
  usePlans,
  type PlanCode,
  type SubscriptionPlan,
} from '@/lib/hooks/useSubscription';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';

/** Nombre de lignes `f1…fN` sous `settings.subscription.plans.{code}`. */
const FEATURE_LINES: Record<PlanCode, number> = {
  free: 5,
  solo: 4,
  boutique: 5,
  commerce_plus: 4,
};

/** Limites de la formule, injectées dans ses lignes de fonctions. */
function planValues(plan: SubscriptionPlan) {
  return {
    products: plan.max_products ?? 0,
    orders: plan.max_orders_per_month ?? 0,
    customers: plan.max_customers ?? 0,
    staff: Math.max(0, (plan.max_members ?? 1) - 1),
  };
}

export default function SubscriptionPage() {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();
  const kind = useCatalogKind();
  const { data: subscription, isLoading } = useSubscription();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const downgrade = useDowngradeToFree();
  const [confirming, setConfirming] = useState(false);

  if (isLoading || plansLoading || !subscription || !plans) {
    return (
      <>
        <TopBar title={t('title')} />
        <SectionsSkeleton sections={[1, 3, 3, 3]} className="px-4 pt-4 pb-32" />
      </>
    );
  }

  const currentCode = subscription.effective_plan_code;
  const isTrialing = subscription.status === 'trialing';
  const periodEnd = subscription.current_period_end
    ? formatDate(subscription.current_period_end, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  async function handleDowngrade() {
    await downgrade.mutateAsync();
    setConfirming(false);
  }

  return (
    <>
      <TopBar title={t('title')} />

      <div className="px-4 pt-4 pb-32 flex flex-col gap-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('current_plan')}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {t(`plans.${subscription.plan.code}.name`)}
                {isTrialing && <span className="ms-2 text-xs font-medium text-amber-700 dark:text-amber-400">{t('trial')}</span>}
              </p>
              {isTrialing && subscription.days_remaining !== null && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('trial_remaining', { days: Math.max(0, subscription.days_remaining) })}
                  {periodEnd && <> {t('period_end', { date: periodEnd })}</>}
                </p>
              )}
              {!isTrialing && currentCode !== 'free' && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('plan_active', { name: t(`plans.${subscription.plan.code}.name`) })}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3">
          {plans.map((plan) => {
            const price = formatMoney(plan.price_amount, plan.currency, { maximumFractionDigits: 0 });
            const values = { kind, ...planValues(plan) };
            const isCurrent = plan.code === currentCode;
            const isUpgrade = plan.code !== 'free' && !isCurrent;
            return (
              <section
                key={plan.code}
                className={`rounded-2xl border bg-card p-4 ${
                  isCurrent ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">{t(`plans.${plan.code}.name`)}</p>
                    <p className="text-sm text-muted-foreground">{t(`plans.${plan.code}.description`)}</p>
                  </div>
                  <p className="text-sm font-semibold text-foreground shrink-0">
                    {plan.billing_period === 'month' ? t('per_month', { price }) : price}
                  </p>
                </div>

                <ul className="mt-3 flex flex-col gap-1.5">
                  {Array.from({ length: FEATURE_LINES[plan.code] }, (_, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                      <span>{t(`plans.${plan.code}.f${i + 1}`, values)}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent && (
                  <p className="mt-3 text-xs font-medium text-primary">{t('current')}</p>
                )}
                {isUpgrade && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 w-full"
                    disabled
                  >
                    {t('coming_soon')}
                  </Button>
                )}
              </section>
            );
          })}
        </div>

        {currentCode !== 'free' && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{t('cancel_title')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('cancel_text')}</p>

            {!confirming ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setConfirming(true)}
              >
                {t('cancel_cta')}
              </Button>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDowngrade}
                  disabled={downgrade.isPending}
                >
                  {downgrade.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {t('cancelling')}</>
                  ) : (
                    t('cancel_confirm')
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                  disabled={downgrade.isPending}
                >
                  {t('cancel_back')}
                </Button>
              </div>
            )}
            {downgrade.isError && (
              <p className="mt-2 text-sm text-destructive">{t('cancel_error')}</p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
