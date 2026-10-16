'use client';

import { useTranslations } from 'next-intl';
import { PlanUsage } from '@/components/subscription/PlanUsage';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Subscription, SubscriptionPlan, UsageCounter, UsageKey } from '@/lib/hooks/useSubscription';

interface PlanActivityProps {
  subscription: Subscription;
  /** Découverte, dont les plafonds servent de comparaison en essai et en formule payante. */
  freePlan: SubscriptionPlan | undefined;
}

/** Usage de la boutique face aux plafonds de Découverte (formule de repli). */
function againstFreePlan(usage: Record<UsageKey, UsageCounter>, free: SubscriptionPlan): Record<UsageKey, UsageCounter> {
  return {
    orders_this_month: { count: usage.orders_this_month.count, limit: free.max_orders_per_month },
    products: { count: usage.products.count, limit: free.max_products },
    customers: { count: usage.customers.count, limit: free.max_customers },
    members: { count: usage.members.count, limit: free.max_members },
  };
}

/** Sans la jauge « équipe » tant que l'équipe tient dans le plafond de Découverte (propriétaire seul). */
function withoutSoloTeam(usage: Record<UsageKey, UsageCounter>): Partial<Record<UsageKey, UsageCounter>> {
  const { members, ...rest } = usage;
  return members.limit !== null && members.count > members.limit ? usage : rest;
}

/**
 * « Votre activité ». Sur Découverte : les jauges de la formule. En essai ou en formule payante :
 * l'usage comparé aux plafonds de Découverte, qui s'appliqueront après l'essai ou une résiliation.
 * La jauge « équipe » n'apparaît que si l'équipe dépasse le plafond de Découverte.
 */
export function PlanActivity({ subscription, freePlan }: PlanActivityProps) {
  const t = useTranslations('settings.subscription');
  const onFree = subscription.effective_plan_code === 'free';
  const usage = onFree ? subscription.usage : freePlan && againstFreePlan(subscription.usage, freePlan);
  if (!usage) return null;

  return (
    <SectionCard title={t('activity_title')} rightSlot={onFree ? undefined : (
      <span className="text-muted-foreground">{t('activity_limits')}</span>
    )}>
      <div className="flex flex-col gap-4 p-5" data-activity={onFree ? 'plan' : 'free_limits'}>
        <PlanUsage usage={withoutSoloTeam(usage)} />
        {!onFree && (
          <p className="text-sm text-muted-foreground">
            {t('activity_after', { status: subscription.status === 'trialing' ? 'trialing' : 'paid' })}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
