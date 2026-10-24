'use client';

import { useTranslations } from 'next-intl';
import { ActivityAfter } from '@/components/subscription/ActivityAfter';
import { PlanUsage } from '@/components/subscription/PlanUsage';
import { UsageGauge } from '@/components/subscription/UsageGauge';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { againstPlan } from '@/lib/hooks/usePlanUsage';
import type { Subscription, SubscriptionPlan, UsageCounter } from '@/lib/hooks/useSubscription';

interface PlanActivityProps {
  subscription: Subscription;
  /** Découverte, dont les plafonds servent de comparaison en essai et après une résiliation programmée. */
  freePlan: SubscriptionPlan | undefined;
  /** Formule d'un changement programmé (lue dans la grille), comparée à l'usage à partir de sa date. */
  scheduledPlan: SubscriptionPlan | undefined;
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
 * « Votre activité ». Essai sans abonnement Stripe : l'usage comparé aux plafonds de Découverte, qui
 * s'appliqueront à la fin de l'essai. Sinon (Découverte, formule payante) : l'usage face aux limites
 * de la formule en vigueur, illimitées comprises ; résiliation programmée : en plus, « Après le … »
 * face aux plafonds de Découverte ; changement de formule programmé : « Après le … » face aux limites
 * de la formule qui prendra le relais. Suivi, à part, de « Ce mois-ci » (lectures avancées), dont le
 * plafond est celui de la formule en cours.
 */
export function PlanActivity({ subscription, freePlan, scheduledPlan }: PlanActivityProps) {
  const t = useTranslations('settings.subscription');
  const formatDate = useFormatDate();
  const trial = subscription.effective_plan_code !== 'free' && subscription.status === 'trialing' && !subscription.stripe_managed;
  const usage = trial ? freePlan && againstPlan(subscription.usage, freePlan) : subscription.usage;
  const end = subscription.stripe_managed && subscription.cancel_at_period_end ? subscription.current_period_end : null;
  const change = subscription.scheduled_change;
  const changeAt = change && change.plan !== subscription.effective_plan_code ? change.at ?? subscription.current_period_end : null;
  const longDate = (iso: string) => formatDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
  const aiReads = <AiReadsUsage counter={subscription.ai_reads_enabled ? subscription.ai_reads : null} />;
  if (!usage) return aiReads;

  return (
    <>
      <section aria-labelledby="activity-title" className="flex flex-col gap-3" data-activity={trial ? 'free_limits' : 'plan'}>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="activity-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('activity_title')}</h2>
            {trial && <span className="text-[0.8125rem] font-medium text-muted-foreground">{t('activity_limits')}</span>}
          </div>
          {trial && <p className="max-w-2xl text-sm text-muted-foreground">{t('activity_after', { status: 'trialing' })}</p>}
        </div>
        <PlanUsage usage={usage} />
      </section>
      {end && freePlan && <ActivityAfter usage={subscription.usage} plan={freePlan} date={longDate(end)} />}
      {!end && changeAt && scheduledPlan && <ActivityAfter usage={subscription.usage} plan={scheduledPlan} date={longDate(changeAt)} />}
      {aiReads}
    </>
  );
}
