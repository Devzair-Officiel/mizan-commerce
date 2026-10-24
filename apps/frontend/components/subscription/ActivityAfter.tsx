'use client';

import { useTranslations } from 'next-intl';
import { PlanUsage } from '@/components/subscription/PlanUsage';
import { againstPlan } from '@/lib/hooks/usePlanUsage';
import type { SubscriptionPlan, UsageCounter, UsageKey } from '@/lib/hooks/useSubscription';

interface ActivityAfterProps {
  usage: Record<UsageKey, UsageCounter>;
  /** Formule qui s'appliquera à `date` (Découverte après une résiliation programmée). */
  plan: SubscriptionPlan;
  /** Date déjà formatée. */
  date: string;
}

/** « Après le {date} » : l'usage d'aujourd'hui face aux limites de la formule qui prendra le relais. */
export function ActivityAfter({ usage, plan, date }: ActivityAfterProps) {
  const t = useTranslations('settings.subscription');
  return (
    <section aria-labelledby="activity-after-title" className="flex flex-col gap-3" data-activity-after={plan.code}>
      <div className="flex flex-col gap-1">
        <h2 id="activity-after-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('activity_after_date', { date })}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('activity_after_date_text', { plan: t(`plans.${plan.code}.name`) })}</p>
      </div>
      <PlanUsage usage={againstPlan(usage, plan)} />
    </section>
  );
}
