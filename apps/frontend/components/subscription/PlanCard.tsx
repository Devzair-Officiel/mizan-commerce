'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { PlanCode, SubscriptionPlan, SubscriptionStatus } from '@/lib/hooks/useSubscription';
import { planPrice, type BillingPeriod } from '@/lib/plan-pricing';
import { cn } from '@/lib/utils';

/** Nombre de lignes `f1…fN` sous `settings.subscription.plans.{code}`. */
const FEATURE_LINES: Record<PlanCode, number> = { free: 5, solo: 4, boutique: 6, commerce_plus: 4 };

/** Où en est la boutique avec cette formule : elle l'a, elle l'essaie, ou non. */
export type PlanCardState = 'current' | 'trial' | 'other';

interface PlanCardProps {
  plan: SubscriptionPlan;
  period: BillingPeriod;
  state: PlanCardState;
  status: SubscriptionStatus;
  recommended: boolean;
  /** Sur mobile, une seule carte à la fois (celle de l'onglet). */
  hiddenOnMobile: boolean;
  onChoose: (code: PlanCode, period: BillingPeriod) => void;
}

/** CTA de la carte ; Découverte n'en a pas : on y revient en résiliant, en bas de page. */
function PlanCta({ plan, period, state, status, recommended, onChoose }: Omit<PlanCardProps, 'hiddenOnMobile'>) {
  const t = useTranslations('settings.subscription');
  const name = t(`plans.${plan.code}.name`);
  if (state === 'current') {
    return <p className="flex h-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">{t('current')}</p>;
  }
  if (plan.code === 'free') {
    return <p className="flex h-11 items-center justify-center text-center text-sm text-muted-foreground">{t('free_fallback', { status: status === 'trialing' ? 'trialing' : 'paid' })}</p>;
  }
  return (
    <Button type="button" variant={state === 'trial' || recommended ? 'default' : 'outline'} onClick={() => onChoose(plan.code, period)}
      className="h-11 w-full rounded-full px-5 text-sm active:scale-[0.98]">
      {t(state === 'trial' ? 'keep_short' : 'choose_cta', { name })}
    </Button>
  );
}

/** Une formule : prix sur la période choisie, l'autre période en regard, CTA, puis ce qu'elle comprend. */
export function PlanCard({ hiddenOnMobile, ...props }: PlanCardProps) {
  const { plan, period, recommended } = props;
  const t = useTranslations('settings.subscription');
  const kind = useCatalogKind();
  const formatMoney = useFormatMoney();
  const money = (value: string) => formatMoney(value, plan.currency, { maximumFractionDigits: 0 });
  const free = plan.code === 'free';
  const values = {
    kind,
    products: plan.max_products ?? 0,
    orders: plan.max_orders_per_month ?? 0,
    customers: plan.max_customers ?? 0,
    staff: Math.max(0, (plan.max_members ?? 1) - 1),
  };

  return (
    <article id={`plan-card-${plan.code}`} aria-labelledby={`plan-name-${plan.code}`} data-plan={plan.code}
      className={cn('flex flex-col gap-4 rounded-2xl border bg-card p-5', recommended ? 'border-primary ring-1 ring-primary' : 'border-border', hiddenOnMobile && 'max-lg:hidden')}>
      <div className="flex flex-col gap-1">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <h3 id={`plan-name-${plan.code}`} className="text-base font-semibold text-foreground">{t(`plans.${plan.code}.name`)}</h3>
          {recommended && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">{t('recommended')}</span>}
        </div>
        <p className="text-sm text-muted-foreground lg:min-h-10">{t(`plans.${plan.code}.description`)}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{money(planPrice(plan, period))}</span>
          {!free && <span className="text-sm text-muted-foreground">{t('per', { period })}</span>}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {free ? t('free_forever') : t('price_alt', { period, price: money(planPrice(plan, period === 'year' ? 'month' : 'year')) })}
        </p>
      </div>
      <PlanCta {...props} />
      <ul className="flex flex-col gap-2 border-t border-border pt-4">
        {Array.from({ length: FEATURE_LINES[plan.code] }, (_, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>{t(`plans.${plan.code}.f${i + 1}`, values)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
