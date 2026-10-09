'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/lib/hooks/useSubscription';

interface MenuTrialCardProps {
  onNavigate: (href: string) => void;
}

function ExpiredCard({ t, onNavigate }: {
  t: ReturnType<typeof useTranslations<'layout.trial'>>;
  onNavigate: (href: string) => void;
}) {
  return (
    <button type="button" onClick={() => onNavigate('/settings/subscription')}
      className="flex w-full items-center gap-3 text-start p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 active:opacity-80 transition-opacity">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-red-900 dark:text-red-100">{t('card_expired')}</div>
        <div className="text-[0.8125rem] mt-0.5 text-red-700 dark:text-red-300 underline underline-offset-2">{t('card_expired_cta')}</div>
      </div>
      <ChevronRight size={16} className="shrink-0 rtl:rotate-180 text-red-700 dark:text-red-300" aria-hidden />
    </button>
  );
}

export function MenuTrialCard({ onNavigate }: MenuTrialCardProps) {
  const t = useTranslations('layout.trial');
  const { data: subscription, isLoading } = useSubscription();

  if (isLoading || !subscription) return null;

  if (subscription.is_trial_expired && subscription.effective_plan_code === 'free') {
    return <ExpiredCard t={t} onNavigate={onNavigate} />;
  }

  if (subscription.status !== 'trialing') return null;
  const days = subscription.days_remaining;
  if (days === null || days < 0) return null;

  return (
    <button type="button" onClick={() => onNavigate('/settings/subscription')}
      className="flex w-full items-center gap-3 text-start p-3.5 rounded-2xl bg-secondary text-secondary-foreground active:opacity-80 transition-opacity">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{t('menu_trial_title')}</div>
        <div className="text-[0.8125rem] mt-0.5">{t('menu_trial_sub', { days })}</div>
      </div>
      <ChevronRight size={16} className="shrink-0 rtl:rotate-180" aria-hidden />
    </button>
  );
}
