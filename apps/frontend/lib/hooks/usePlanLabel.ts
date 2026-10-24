'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { BillingInterval, PlanCode } from '@/lib/hooks/useSubscription';

/** « Boutique annuel » : nom traduit de la formule et son rythme ; le nom seul sans rythme connu. */
export function usePlanLabel(): (plan: PlanCode, interval: BillingInterval | '') => string {
  const t = useTranslations('settings.subscription');
  return useCallback(
    (plan, interval) => t('change.plan_period', { plan: t(`plans.${plan}.name`), period: interval || 'none' }),
    [t],
  );
}
