'use client';

import { useTranslations } from 'next-intl';
import type { PlanBadgeState } from './planBadgeState';

/** Pastille de la formule courante : « Pro », « Gratuit »… ou « Essai · 12 j ». */
export function PlanBadge({ state }: { state: PlanBadgeState }) {
  const t = useTranslations('layout.trial');
  const tPlans = useTranslations('settings.subscription.plans');

  const label = state.kind === 'trial' ? t('badge_trial', { days: state.days }) : tPlans(`${state.plan}.name`);
  const tone = state.kind === 'trial'
    ? 'bg-primary text-primary-foreground'
    : state.plan === 'free'
      ? 'bg-muted text-foreground'
      : 'bg-secondary text-secondary-foreground';

  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {label}
    </span>
  );
}
