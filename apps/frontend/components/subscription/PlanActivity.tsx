'use client';

import { useTranslations } from 'next-intl';
import { PlanUsage } from '@/components/subscription/PlanUsage';
import { UsageGauge } from '@/components/subscription/UsageGauge';
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
 * « Ce mois-ci » : lectures avancées du scan d'emballage, face au plafond de la formule en cours
 * (essai compris), pas à celui de Découverte. Rien tant que la fonction est éteinte ou illimitée.
 */
function AiReadsUsage({ counter }: { counter: UsageCounter | null }) {
  const t = useTranslations('settings.subscription');
  if (!counter || counter.limit === null) return null;
  return (
    <section aria-labelledby="ai-reads-title" className="flex flex-col gap-3" data-ai-reads>
      <div className="flex flex-col gap-1">
        <h2 id="ai-reads-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ai_reads_title')}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('ai_reads_help')}</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <UsageGauge usageKey="ai_reads_this_month" count={counter.count} limit={counter.limit} />
      </div>
    </section>
  );
}

/**
 * « Votre activité ». Sur Découverte : les jauges de la formule. En essai ou en formule payante :
 * l'usage comparé aux plafonds de Découverte, qui s'appliqueront après l'essai ou une résiliation.
 * La jauge « équipe » n'apparaît que si l'équipe dépasse le plafond de Découverte. Suivi, à part,
 * de « Ce mois-ci » (lectures avancées), dont le plafond est celui de la formule en cours.
 */
export function PlanActivity({ subscription, freePlan }: PlanActivityProps) {
  const t = useTranslations('settings.subscription');
  const onFree = subscription.effective_plan_code === 'free';
  const usage = onFree ? subscription.usage : freePlan && againstFreePlan(subscription.usage, freePlan);
  const aiReads = <AiReadsUsage counter={subscription.ai_reads_enabled ? subscription.ai_reads : null} />;
  if (!usage) return aiReads;

  return (
    <>
      <section aria-labelledby="activity-title" className="flex flex-col gap-3" data-activity={onFree ? 'plan' : 'free_limits'}>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="activity-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('activity_title')}</h2>
            {!onFree && <span className="text-[0.8125rem] font-medium text-muted-foreground">{t('activity_limits')}</span>}
          </div>
          {!onFree && (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t('activity_after', { status: subscription.status === 'trialing' ? 'trialing' : 'paid' })}
            </p>
          )}
        </div>
        <PlanUsage usage={withoutSoloTeam(usage)} />
      </section>
      {aiReads}
    </>
  );
}
