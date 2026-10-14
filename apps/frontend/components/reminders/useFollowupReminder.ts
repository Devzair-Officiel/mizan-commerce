'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatShopDate } from '@/lib/hooks/useFormat';
import { useCreateReminder, useFindFollowupReminder, useUpdateReminder, type Reminder } from '@/lib/hooks/useReminders';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import { notify } from '@/lib/notify';
import { tomorrowAt } from './reminderDates';

/** Client à relancer, et la commande d'où part la relance s'il y en a une. */
export interface FollowupTarget {
  customerId: string;
  customerName: string;
  orderId?: string;
}

interface Conflict { target: FollowupTarget; existing: Reminder; dueAt: string }

export const FOLLOWUP_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };

/**
 * « Marquer à relancer » (fiche client, fiche commande) : rappel pour demain 9 h. Si le client a
 * déjà un rappel de relance en attente, propose de le décaler plutôt que d'en créer un second.
 */
export function useFollowupReminder() {
  const t = useTranslations('reminders.followup');
  const formatDate = useFormatShopDate();
  const tz = useShopTimeZone();
  const find = useFindFollowupReminder();
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const [checking, setChecking] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);

  async function createFor({ customerId, customerName, orderId }: FollowupTarget, dueAt: string) {
    const name = customerName || t('fallback_name');
    await create.mutateAsync({ title: t('title', { name }), due_at: dueAt, category: 'customer_followup', customer: customerId, order: orderId });
    notify.success(t('created', { name, date: formatDate(dueAt, FOLLOWUP_DATE) }));
  }

  async function schedule(target: FollowupTarget) {
    const dueAt = tomorrowAt(9, tz).toISOString();
    setChecking(true);
    try {
      const existing = await find(target.customerId);
      if (existing) setConflict({ target, existing, dueAt });
      else await createFor(target, dueAt);
    } catch {
      notify.error(t('failed'));
    } finally {
      setChecking(false);
    }
  }

  async function postpone() {
    if (!conflict) return;
    await update.mutateAsync({ id: conflict.existing.id, payload: { due_at: conflict.dueAt } });
    notify.success(t('moved', { date: formatDate(conflict.dueAt, FOLLOWUP_DATE) }));
    setConflict(null);
  }

  async function createAnyway() {
    if (!conflict) return;
    await createFor(conflict.target, conflict.dueAt);
    setConflict(null);
  }

  return {
    schedule,
    pending: checking || create.isPending || update.isPending,
    conflict: conflict && {
      customerName: conflict.target.customerName || t('fallback_name'),
      currentDue: conflict.existing.due_at,
      newDue: conflict.dueAt,
      postpone,
      createAnyway,
      close: () => setConflict(null),
    },
  };
}

export type FollowupReminder = ReturnType<typeof useFollowupReminder>;
export type FollowupConflict = NonNullable<FollowupReminder['conflict']>;
