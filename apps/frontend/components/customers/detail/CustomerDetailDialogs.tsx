'use client';

import { useTranslations } from 'next-intl';
import { PreparedMessageDialog } from '@/components/messages/PreparedMessageDialog';
import { FollowupReminderDialog } from '@/components/reminders/FollowupReminderDialog';
import { WhatsAppIcon } from '@/components/orders/detail/constants';
import { ConfirmDialog } from '@/components/ui/dialog';
import type { Customer } from '@/lib/hooks/useCustomers';
import { CustomerAddressSheet } from './CustomerAddressSheet';
import type { CustomerDetailState } from './useCustomerDetailState';

/** Fenêtres de la fiche : message WhatsApp, adresse, confirmation de désactivation, rappel de relance déjà prévu. */
export function CustomerDetailDialogs({ customer, state }: { customer: Customer; state: CustomerDetailState }) {
  const t = useTranslations('customers.detail');
  const { kind, close } = state.whatsApp;

  return (
    <>
      <FollowupReminderDialog conflict={state.followupConflict} />
      {kind && customer.phone && (
        <PreparedMessageDialog
          onClose={close}
          compose={{ template: kind === 'followup' ? 'unpaid_followup' : 'free', customerId: customer.id }}
          contextType="customer"
          contextId={customer.id}
          customerId={customer.id}
          recipientPhone={customer.phone}
          WhatsAppIcon={WhatsAppIcon}
        />
      )}
      <CustomerAddressSheet open={state.address.open} onClose={state.address.close} customer={customer} />
      <ConfirmDialog
        open={state.deactivate.open}
        onOpenChange={state.deactivate.setOpen}
        title={t('deactivate_confirm')}
        onConfirm={state.deactivate.confirm}
        variant="destructive"
        confirmLabel={t('deactivate_cta')}
        cancelLabel={t('cancel')}
      />
    </>
  );
}
