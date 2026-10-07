'use client';

import Link from 'next/link';
import { AlertCircle, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/lib/hooks/useSubscription';

export function TrialBanner() {
  const t = useTranslations('layout.trial');
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading || !subscription) return null;

  if (subscription.is_trial_expired && subscription.effective_plan_code === 'free') {
    return (
      <Link
        href="/settings/subscription"
        className="lg:hidden block bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/50 px-4 py-2 text-sm text-red-900 dark:text-red-100 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
      >
        <div className="flex items-center gap-2 max-w-5xl mx-auto">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1 truncate">{t('banner_expired')}</span>
          <span className="shrink-0 text-xs font-medium underline underline-offset-2">
            {t('banner_expired_cta')}
          </span>
        </div>
      </Link>
    );
  }

  if (subscription.status !== 'trialing') return null;
  const days = subscription.days_remaining;
  if (days === null || days < 0) return null;

  const label = days === 0
    ? t('banner_today')
    : days === 1
      ? t('banner_tomorrow')
      : t('banner_days', { days });

  return (
    <Link
      href="/settings/subscription"
      className="lg:hidden block bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors"
    >
      <div className="flex items-center gap-2 max-w-5xl mx-auto">
        <Sparkles size={16} className="shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs font-medium underline underline-offset-2">
          {t('banner_cta')}
        </span>
      </div>
    </Link>
  );
}

