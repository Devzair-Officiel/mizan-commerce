'use client';

import Link from 'next/link';
import { AlertCircle, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { PlanBadge } from './PlanBadge';
import { planBadgeState } from './planBadgeState';

/** Formule courante dans le pied de la sidebar, au-dessus du menu compte ; mène à Paramètres → Abonnement. */
export function SidebarPlanBadge() {
  const t = useTranslations('layout.trial');
  const tSub = useTranslations('settings.subscription');
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading) return <div className="mb-1 h-11 rounded-xl bg-muted animate-pulse" />;
  if (!subscription) return null;

  const state = planBadgeState(subscription);
  const expired = state.kind === 'expired';
  const Icon = expired ? AlertCircle : Sparkles;

  return (
    <Link
      href="/settings/subscription"
      className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all hover:bg-muted active:scale-[0.98] ${
        expired ? 'text-destructive' : 'text-foreground'
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        <Icon className={`h-4.5 w-4.5 ${expired ? '' : 'text-muted-foreground'}`} aria-hidden />
      </span>
      <span className="flex-1 min-w-0 truncate">{expired ? t('card_expired') : tSub('title')}</span>
      <PlanBadge state={state} />
    </Link>
  );
}
