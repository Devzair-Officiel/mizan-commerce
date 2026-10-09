'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/lib/hooks/useSubscription';

export function SidebarTrialCard() {
  const t = useTranslations('layout.trial');
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading || !subscription) return null;

  if (subscription.is_trial_expired && subscription.effective_plan_code === 'free') {
    return (
      <Link
        href="/settings/subscription"
        className="mx-3 mb-1 block rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-3 text-xs hover:opacity-90 transition-opacity"
      >
        <div className="font-semibold text-red-900 dark:text-red-100 mb-0.5">{t('card_expired')}</div>
        <div className="text-red-700 dark:text-red-300 underline underline-offset-2">{t('card_expired_cta')}</div>
      </Link>
    );
  }

  if (subscription.status !== 'trialing') return null;
  const days = subscription.days_remaining;
  if (days === null || days < 0) return null;

  return (
    <Link
      href="/settings/subscription"
      className="mx-3 mb-1 block rounded-xl bg-muted p-3 text-xs hover:opacity-90 transition-opacity"
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="font-semibold text-foreground">{t('card_days', { days })}</span>
        <span className="text-primary font-semibold shrink-0">{t('card_cta')}</span>
      </div>
      <div className="text-muted-foreground">Boutique+</div>
    </Link>
  );
}
