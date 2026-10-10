'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, ClipboardPlus, MapPin, PowerOff, RotateCcw, StickyNote } from 'lucide-react';
import type { DetailAction, DetailMenuActions } from '@/components/detail/types';
import { WhatsAppIcon } from '@/components/orders/detail/constants';
import type { Customer } from '@/lib/hooks/useCustomers';
import type { CustomerDetailActions } from './useCustomerDetailState';

export type CustomerActionKey = 'followup' | 'new_order' | 'reminder' | 'note' | 'address' | 'deactivate' | 'reactivate';
type CustomerAction = DetailAction<CustomerActionKey>;

export function hasPending(customer: Customer): boolean {
  return Number(customer.pending_amount) > 0;
}

/**
 * Action principale, comme sur la commande : un reste à payer et un téléphone → « Relancer »
 * (WhatsApp préparé) ; sinon « Nouvelle commande » avec ce client déjà choisi.
 * Un client désactivé ne reçoit pas de nouvelle commande.
 * Le menu « ⋯ » reprend le reste, sans doublon de l'action principale.
 */
export function useCustomerActions(customer: Customer, actions: CustomerDetailActions) {
  const t = useTranslations('customers.detail');
  const router = useRouter();
  const newOrder: CustomerAction = {
    key: 'new_order', icon: ClipboardPlus, label: t('new_order'),
    onSelect: () => router.push(`/orders/new?customer=${customer.id}&from=/customers/${customer.id}`),
  };
  const primary: CustomerAction | null = hasPending(customer) && customer.phone
    ? { key: 'followup', icon: WhatsAppIcon, label: t('followup'), onSelect: () => actions.openWhatsApp('followup') }
    : customer.is_active ? newOrder : null;

  const items: CustomerAction[] = [];
  if (customer.is_active && primary?.key !== 'new_order') items.push(newOrder);
  items.push(
    {
      key: 'reminder', icon: Bell, disabled: actions.pending || actions.reminderCreated,
      label: actions.reminderCreated ? t('reminder_created_today') : t('reminder_schedule'),
      onSelect: () => { void actions.scheduleReminder(); },
    },
    { key: 'note', icon: StickyNote, label: t('add_note'), onSelect: actions.openNoteForm },
    { key: 'address', icon: MapPin, label: t('edit_address'), onSelect: () => router.push(`/customers/${customer.id}/edit`) },
  );
  const danger: CustomerAction = customer.is_active
    ? { key: 'deactivate', icon: PowerOff, label: t('deactivate'), destructive: true, disabled: actions.pending, onSelect: actions.confirmDeactivate }
    : { key: 'reactivate', icon: RotateCcw, label: t('reactivate'), disabled: actions.pending, onSelect: () => { void actions.reactivate(); } };
  const menu: DetailMenuActions<CustomerActionKey> = { items, danger };
  return { primary, menu };
}
