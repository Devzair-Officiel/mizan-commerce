'use client';

import { useState } from 'react';
import { useDeactivateCustomer, useReactivateCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { useFollowupReminder } from '@/components/reminders/useFollowupReminder';

/** Message WhatsApp ouvert : relance des impayés ou message libre. */
export type CustomerWhatsApp = 'followup' | 'free' | null;

/** Gestes de la fiche, appelés par l'action principale, le menu « ⋯ » et les cartes. */
export interface CustomerDetailActions {
  openWhatsApp: (kind: Exclude<CustomerWhatsApp, null>) => void;
  scheduleReminder: () => Promise<void>;
  openNoteForm: () => void;
  openAddress: () => void;
  confirmDeactivate: () => void;
  reactivate: () => Promise<void>;
  pending: boolean;
}

/** État de la fiche client : fenêtres ouvertes, rappel de relance, désactivation. */
export function useCustomerDetailState(customer: Customer) {
  const followup = useFollowupReminder();
  const deactivate = useDeactivateCustomer();
  const reactivate = useReactivateCustomer();
  const [whatsApp, setWhatsApp] = useState<CustomerWhatsApp>(null);
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const actions: CustomerDetailActions = {
    openWhatsApp: setWhatsApp,
    scheduleReminder: () => followup.schedule({ customerId: customer.id, customerName: customer.display_name }),
    openNoteForm: () => {
      setNoteFormOpen(true);
      requestAnimationFrame(() => document.getElementById('customer-notes')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    },
    openAddress: () => setAddressOpen(true),
    confirmDeactivate: () => setDeactivateOpen(true),
    reactivate: async () => { await reactivate.mutateAsync(customer.id); },
    pending: followup.pending || deactivate.isPending || reactivate.isPending,
  };

  return {
    actions,
    followupConflict: followup.conflict,
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
