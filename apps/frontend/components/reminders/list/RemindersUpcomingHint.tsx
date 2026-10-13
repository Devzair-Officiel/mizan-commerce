'use client';

import { useTranslations } from 'next-intl';
import type { ReminderSummary } from '@/lib/hooks/useReminders';

/** Sous « À faire » : « Demain : 1 rappel. Cette semaine : 3 rappels. Voir À venir ». */
export function RemindersUpcomingHint({ summary, onShow }: { summary: ReminderSummary; onShow: () => void }) {
  const t = useTranslations('reminders.list');
  if (summary.upcoming === 0) return null;
  return (
    <p className="text-[0.8125rem] text-muted-foreground">
      {t('upcoming_hint', { tomorrow: summary.tomorrow, week: summary.this_week })}{' '}
      <button type="button" onClick={onShow} className="font-semibold text-primary underline-offset-4 hover:underline">
        {t('see_upcoming')}
      </button>
    </p>
  );
}
