'use client';

import { AlertCircle, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { MenuRow, type MenuRowNav } from './MenuRow';
import { PlanBadge } from './PlanBadge';
import { planBadgeState } from './planBadgeState';

/** Formule courante dans le menu (burger et sidebar) ; mène à Paramètres → Abonnement. */
export function MenuPlanBadge({ nav }: { nav: MenuRowNav }) {
  const t = useTranslations('layout.trial');
  const tSub = useTranslations('settings.subscription');
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading) return <div className="h-13.5 rounded-2xl bg-muted animate-pulse" />;
  if (!subscription) return null;

  const state = planBadgeState(subscription);
  const expired = state.kind === 'expired';
  const Icon = expired ? AlertCircle : Sparkles;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <MenuRow
        icon={<Icon className="h-4.5 w-4.5" />}
        label={expired ? t('card_expired') : tSub('title')}
        {...nav}
        badge={<PlanBadge state={state} />}
        danger={expired}
        isFirst
      />
    </div>
  );
}
