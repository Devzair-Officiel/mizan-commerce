'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { FollowupReminderDialog } from '@/components/reminders/FollowupReminderDialog';
import { ReminderEditMenu } from '@/components/reminders/form/ReminderEditMenu';
import { ReminderForm } from '@/components/reminders/form/ReminderForm';
import { useSaveReminder } from '@/components/reminders/form/useSaveReminder';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { useReminder } from '@/lib/hooks/useReminders';
import { useShop } from '@/lib/hooks/useShop';

const SUBTITLE_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

export default function EditReminderPage() {
  const t = useTranslations('reminders.edit');
  const tNav = useTranslations('layout.nav');
  const { id } = useParams<{ id: string }>();
  const formatDate = useFormatDate();
  const back = useBackOr('/reminders');
  const { data: reminder, isLoading: reminderLoading } = useReminder(id);
  // Le fuseau de la boutique donne la date et l'heure affichées dans le formulaire.
  const { isLoading: shopLoading } = useShop();
  const isLoading = reminderLoading || shopLoading;
  const { save, isPending, conflict } = useSaveReminder(id, back);

  if (isLoading || !reminder) {
    return (
      <div className="mx-auto w-full max-w-280">
        <TopBar title={t('title')} back backLabel={tNav('reminders')} onBack={back} hideSearch />
        {isLoading
          ? <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
          : <p className="p-4 text-sm text-destructive">{t('not_found')}</p>}
      </div>
    );
  }

  const doneAt = reminder.status === 'done' ? reminder.done_at : null;
  const subtitle = t('subtitle', {
    state: doneAt ? 'done' : reminder.is_automatic ? 'automatic' : 'other',
    date: formatDate(doneAt ?? reminder.created_at, SUBTITLE_DATE),
  });
  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('title')} subtitle={subtitle} back backLabel={tNav('reminders')} onBack={back} hideSearch
        action={<ReminderEditMenu reminder={reminder} onDeleted={back} />} />
      <ReminderForm mode="edit" defaultValues={reminder} onSubmit={save} isSubmitting={isPending} onLeave={back} />
      <FollowupReminderDialog conflict={conflict} />
    </div>
  );
}
