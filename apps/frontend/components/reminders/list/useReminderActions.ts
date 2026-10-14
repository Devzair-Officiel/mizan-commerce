'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatShopDate } from '@/lib/hooks/useFormat';
import {
  useDeleteReminder, useMarkReminderDone, useReopenReminder, useUpdateReminder, type Reminder,
} from '@/lib/hooks/useReminders';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import { notify } from '@/lib/notify';
import { inOneHour, nextMondayAt, tomorrowAt } from '../reminderDates';

const DATE_TIME: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

export type PostponeKey = 'hour' | 'tomorrow' | 'monday' | 'custom';

/** Choix de « Reporter », à l'heure de la boutique ; `custom` ouvre le choix d'une date. */
export const POSTPONE_OPTIONS: { key: PostponeKey; date?: (timeZone: string) => Date }[] = [
  { key: 'hour', date: inOneHour },
  { key: 'tomorrow', date: (tz) => tomorrowAt(9, tz) },
  { key: 'monday', date: (tz) => nextMondayAt(9, tz) },
  { key: 'custom' },
];

/** Relance client avec un numéro : « Relancer » ouvre le message WhatsApp préparé. */
export function canFollowUp(r: Reminder): boolean {
  return r.status === 'pending' && ['customer_followup', 'unpaid'].includes(r.category) && !!r.customer_info?.phone;
}

/**
 * Actions d'une ligne de la page Rappels, partagées par toutes les lignes : une seule
 * fenêtre de chaque sorte (relance, date, report mobile, suppression) pour la page.
 */
export function useReminderActions() {
  const t = useTranslations('reminders.list');
  const formatDate = useFormatShopDate();
  const tz = useShopTimeZone();
  const markDone = useMarkReminderDone();
  const reopen = useReopenReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const [followUp, setFollowUp] = useState<Reminder | null>(null);
  const [pickDate, setPickDate] = useState<Reminder | null>(null);
  const [postponeSheet, setPostponeSheet] = useState<Reminder | null>(null);
  const [toDelete, setToDelete] = useState<Reminder | null>(null);
  const failed = () => notify.error(t('action_failed'));

  function reopenOne(r: Reminder) {
    reopen.mutate(r.id, { onSuccess: () => notify.success(t('reopened_toast')), onError: failed });
  }

  function toggleDone(r: Reminder) {
    if (r.status === 'done') return reopenOne(r);
    markDone.mutate(r.id, {
      onSuccess: () => notify.success(t('done_toast', { title: r.title }), {
        label: t('undo'),
        onClick: () => reopen.mutate(r.id, { onError: failed }),
      }),
      onError: failed,
    });
  }

  function postponeTo(r: Reminder, date: Date) {
    update.mutate({ id: r.id, payload: { due_at: date.toISOString() } }, {
      onSuccess: () => notify.success(t('postponed_toast', { date: formatDate(date, DATE_TIME) })),
      onError: failed,
    });
  }

  function postpone(r: Reminder, key: PostponeKey) {
    const option = POSTPONE_OPTIONS.find((o) => o.key === key);
    if (option?.date) postponeTo(r, option.date(tz));
    else setPickDate(r);
  }

  return {
    toggleDone,
    postpone,
    postponeTo,
    openFollowUp: setFollowUp,
    openPostponeSheet: setPostponeSheet,
    askDelete: setToDelete,
    followUp, closeFollowUp: () => setFollowUp(null),
    pickDate, closePickDate: () => setPickDate(null),
    postponeSheet, closePostponeSheet: () => setPostponeSheet(null),
    toDelete, closeDelete: () => setToDelete(null),
    confirmDelete: async () => {
      if (!toDelete) return;
      // Message générique dans la fenêtre : jamais le détail de l'erreur serveur.
      await remove.mutateAsync(toDelete.id).catch(() => { throw new Error(t('action_failed')); });
      notify.success(t('deleted_toast'));
    },
  };
}

export type ReminderActions = ReturnType<typeof useReminderActions>;
