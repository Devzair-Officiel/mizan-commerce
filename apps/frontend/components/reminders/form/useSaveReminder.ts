'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/hooks/useFormat';
import {
  useCreateReminder, useFindFollowupReminder, useUpdateReminder, type Reminder, type ReminderPayload,
} from '@/lib/hooks/useReminders';
import { notify } from '@/lib/notify';
import { FOLLOWUP_DATE, type FollowupConflict } from '../useFollowupReminder';

type Choice = 'postpone' | 'create' | 'cancel';
interface Pending { existing: Reminder; dueAt: string; resolve: (choice: Choice) => void }

/** Question « une relance existe déjà, la décaler ? », attendue comme une promesse par l'enregistrement. */
function useConflictPrompt() {
  const t = useTranslations('reminders.followup');
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = (existing: Reminder, dueAt: string) => new Promise<Choice>((resolve) => setPending({ existing, dueAt, resolve }));
  const answer = (choice: Choice) => async () => { pending?.resolve(choice); setPending(null); };
  const conflict: FollowupConflict | null = pending && {
    customerName: pending.existing.customer_info?.display_name || t('fallback_name'),
    currentDue: pending.existing.due_at,
    newDue: pending.dueAt,
    postpone: answer('postpone'),
    createAnyway: answer('create'),
    close: () => { void answer('cancel')(); },
  };
  return { ask, conflict };
}

/**
 * Enregistrement du formulaire de rappel. En création, une relance client pour un client qui en a
 * déjà une en attente propose de décaler l'existante plutôt que d'en créer une seconde.
 */
export function useSaveReminder(reminderId: string | undefined, onSaved: () => void) {
  const t = useTranslations('reminders.form');
  const tFollowup = useTranslations('reminders.followup');
  const formatDate = useFormatDate();
  const find = useFindFollowupReminder();
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const { ask, conflict } = useConflictPrompt();

  async function save(payload: ReminderPayload) {
    if (reminderId) {
      await update.mutateAsync({ id: reminderId, payload });
      notify.success(t('toast_saved'));
      return onSaved();
    }
    const existing = payload.category === 'customer_followup' && payload.customer ? await find(payload.customer) : null;
    const choice = existing ? await ask(existing, payload.due_at) : 'create';
    if (choice === 'cancel') return;
    if (choice === 'postpone' && existing) {
      await update.mutateAsync({ id: existing.id, payload: { due_at: payload.due_at } });
      notify.success(tFollowup('moved', { date: formatDate(payload.due_at, FOLLOWUP_DATE) }));
    } else {
      await create.mutateAsync(payload);
      notify.success(t('toast_created'));
    }
    onSaved();
  }

  return { save, isPending: create.isPending || update.isPending, conflict };
}
