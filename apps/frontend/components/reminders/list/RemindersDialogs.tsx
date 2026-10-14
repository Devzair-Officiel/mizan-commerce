'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ReminderDateDialog } from './ReminderDateDialog';
import { ReminderFollowUpDialog } from './ReminderFollowUpDialog';
import { ReminderPostponeSheet } from './ReminderPostponeSheet';
import type { ReminderActions } from './useReminderActions';

/** Fenêtres de la page, une de chaque sorte : relance, report (mobile), date choisie, suppression. */
export function RemindersDialogs({ actions }: { actions: ReminderActions }) {
  const t = useTranslations('reminders.list');
  return (
    <>
      {actions.followUp && <ReminderFollowUpDialog reminder={actions.followUp} onClose={actions.closeFollowUp} />}
      {actions.postponeSheet && (
        <ReminderPostponeSheet reminder={actions.postponeSheet} onClose={actions.closePostponeSheet} onSelect={actions.postpone} />
      )}
      {actions.pickDate && (
        <ReminderDateDialog reminder={actions.pickDate} onClose={actions.closePickDate}
          onSubmit={(date) => actions.pickDate && actions.postponeTo(actions.pickDate, date)} />
      )}
      <ConfirmDialog
        open={!!actions.toDelete}
        onOpenChange={(open) => { if (!open) actions.closeDelete(); }}
        title={t('delete_confirm', { title: actions.toDelete?.title ?? '' })}
        description={actions.toDelete?.is_automatic ? t('delete_automatic_hint') : undefined}
        onConfirm={actions.confirmDelete}
        variant="destructive"
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
      />
    </>
  );
}
