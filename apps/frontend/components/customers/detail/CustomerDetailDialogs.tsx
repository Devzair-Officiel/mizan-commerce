'use client';

import { useTranslations } from 'next-intl';
import { PreparedMessageDialog } from '@/components/messages/PreparedMessageDialog';
import { WhatsAppIcon } from '@/components/orders/detail/constants';
import { ConfirmDialog } from '@/components/ui/dialog';
import type { Customer } from '@/lib/hooks/useCustomers';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrders } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { CustomerAddressSheet } from './CustomerAddressSheet';
import { CustomerFlashNotification } from './CustomerFlashNotification';
import { buildFollowupMessage } from './followupMessage';
import { hasPending } from './useCustomerActions';
import type { CustomerDetailState } from './useCustomerDetailState';

/** Fenêtres de la fiche : message WhatsApp, adresse, confirmation de désactivation, rappel créé. */
export function CustomerDetailDialogs({ customer, state }: { customer: Customer; state: CustomerDetailState }) {
  const t = useTranslations('customers.detail');
  const tWa = useTranslations('customers.whatsapp');
  const tGreeting = useTranslations('messages.prepared');
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  // Chargées dès l'ouverture de la fiche : le message de relance est prêt au clic.
  const { data: dueOrders } = useOrders({ customer: customer.id, due: true }, { enabled: hasPending(customer) && !!customer.phone });
  const { kind, close } = state.whatsApp;
  const firstName = customer.name.trim().split(/\s+/)[0] ?? '';

  const message = kind === 'followup'
    ? buildFollowupMessage(customer.name, dueOrders?.results ?? [], customer.pending_amount,
      { tWa, formatMoney, formatDate, currency: shop?.currency ?? 'EUR' })
    : firstName ? tGreeting('greeting_named', { name: firstName }) : tGreeting('greeting');

  return (
    <>
      <CustomerFlashNotification visible={state.flash.visible} customerName={customer.name} onDismiss={state.flash.dismiss} />
      {kind && customer.phone && (
        <PreparedMessageDialog
          open
          onClose={close}
          templateType={kind === 'followup' ? 'unpaid_followup' : 'free'}
          contextType="customer"
          contextId={customer.id}
          customerId={customer.id}
          recipientPhone={customer.phone}
          initialMessage={message}
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
