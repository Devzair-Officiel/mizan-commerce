'use client';

import { useTranslations } from 'next-intl';
import type { PlanBadgeState } from './planBadgeState';

const TONES: Record<PlanBadgeState['kind'], string> = {
  trial: 'bg-primary text-primary-foreground',
  expired: 'bg-destructive/10 text-destructive',
  plan: 'bg-secondary text-secondary-foreground',
};

/** Pastille de la formule courante : « Solo », « Boutique »…, « Essai · 12 j » ou « Essai terminé ». */
export function PlanBadge({ state }: { state: PlanBadgeState }) {
  const t = useTranslations('layout.trial');

  const label = state.kind === 'trial'
    ? t('badge_trial', { days: state.days })
    : state.kind === 'expired' ? t('card_expired') : state.name;

  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${TONES[state.kind]}`}>
      {label}
    </span>
  );
}
