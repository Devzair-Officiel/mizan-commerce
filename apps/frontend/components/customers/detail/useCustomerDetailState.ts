'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDeactivateCustomer, useReactivateCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { useCreateReminder } from '@/lib/hooks/useReminders';

/** Message WhatsApp ouvert : relance des impayés ou message libre. */
export type CustomerWhatsApp = 'followup' | 'free' | null;

/** Gestes de la fiche, appelés par l'action principale, le menu « ⋯ » et les cartes. */
export interface CustomerDetailActions {
  openWhatsApp: (kind: Exclude<CustomerWhatsApp, null>) => void;
  scheduleReminder: () => Promise<void>;
  /** Un rappel a déjà été créé aujourd'hui depuis cette fiche. */
  reminderCreated: boolean;
  openNoteForm: () => void;
  openAddress: () => void;
  confirmDeactivate: () => void;
  reactivate: () => Promise<void>;
  pending: boolean;
}

function tomorrowAtNine(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** État de la fiche client : fenêtres ouvertes, rappel du jour, désactivation. */
export function useCustomerDetailState(customer: Customer) {
  const t = useTranslations('customers.detail');
  const createReminder = useCreateReminder();
  const deactivate = useDeactivateCustomer();
  const reactivate = useReactivateCustomer();
  const todayKey = `relance_${customer.id}_${new Date().toISOString().slice(0, 10)}`;
  const [reminderCreated, setReminderCreated] = useState(() => {
    try { return localStorage.getItem(todayKey) === '1'; } catch { return false; }
  });
  const [flash, setFlash] = useState(false);
  const [whatsApp, setWhatsApp] = useState<CustomerWhatsApp>(null);
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  async function scheduleReminder() {
    await createReminder.mutateAsync({
      title: t('reminder_title', { name: customer.name || t('reminder_fallback_name') }),
      due_at: tomorrowAtNine(),
      category: 'customer_followup',
      customer: customer.id,
    });
    setReminderCreated(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 3000);
    try { localStorage.setItem(todayKey, '1'); } catch { /* stockage indisponible */ }
  }

  const actions: CustomerDetailActions = {
    openWhatsApp: setWhatsApp,
    scheduleReminder,
    reminderCreated,
    openNoteForm: () => {
      setNoteFormOpen(true);
      requestAnimationFrame(() => document.getElementById('customer-notes')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    },
    openAddress: () => setAddressOpen(true),
    confirmDeactivate: () => setDeactivateOpen(true),
    reactivate: async () => { await reactivate.mutateAsync(customer.id); },
    pending: createReminder.isPending || deactivate.isPending || reactivate.isPending,
  };

  return {
    actions,
    flash: { visible: flash, dismiss: () => setFlash(false) },
    whatsApp: { kind: whatsApp, close: () => setWhatsApp(null) },
    notes: { formOpen: noteFormOpen, setFormOpen: setNoteFormOpen },
    address: { open: addressOpen, close: () => setAddressOpen(false) },
    deactivate: {
      open: deactivateOpen,
      setOpen: setDeactivateOpen,
      confirm: async () => { await deactivate.mutateAsync(customer.id); },
    },
  };
}

export type CustomerDetailState = ReturnType<typeof useCustomerDetailState>;
