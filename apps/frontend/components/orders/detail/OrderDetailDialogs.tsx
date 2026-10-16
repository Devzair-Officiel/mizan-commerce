'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/dialog';
import { PreparedMessageDialog } from '@/components/messages/PreparedMessageDialog';
import { FollowupReminderDialog } from '@/components/reminders/FollowupReminderDialog';
import { UpgradeSheet } from '@/components/subscription/UpgradeSheet';
import type { Order } from '@/lib/hooks/useOrders';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { remainingDue, WhatsAppIcon } from './constants';
import { InvoiceBottomSheet } from './InvoiceBottomSheet';
import { PaymentBottomSheet } from './PaymentBottomSheet';
import type { OrderDetailState } from './useOrderDetailState';

type DialogsState = Pick<OrderDetailState, 'payment' | 'invoice' | 'confirm' | 'whatsApp' | 'followupConflict'>;

/** Fenêtres de la page détail : encaissement, facture, confirmations, message WhatsApp, rappel de relance déjà prévu. */
export function OrderDetailDialogs({ order, state }: { order: Order; state: DialogsState }) {
  const t = useTranslations('orders.detail');
  const tInvoice = useTranslations('orders.invoiceCard');
  const invoicesAllowed = usePlanGating().can('invoices');
  const tc = useTranslations('layout.common');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const { payment, invoice, confirm, whatsApp } = state;
  const kind = shop?.catalog_kind ?? 'both';
  const reactivating = confirm.kind === 'reactivate';

  return (
    <>
      <PaymentBottomSheet open={payment.open} onClose={payment.close} initialAmount={payment.preset}
        totalAmount={parseFloat(order.total_amount)} paidAmount={parseFloat(order.amount_paid)}
        remaining={remainingDue(order).toFixed(2)} isPending={payment.isPending} onSubmit={payment.submit} />
      <UpgradeSheet open={invoice.open && !invoicesAllowed} onClose={invoice.close} feature="invoices" title={tInvoice('title')} />
      <InvoiceBottomSheet open={invoice.open && invoicesAllowed} onClose={invoice.close}
        defaultTaxRate={shop?.default_tax_rate ?? '0'} defaultTermsDays={String(shop?.default_payment_terms_days ?? 30)}
        isPending={invoice.isPending} error={invoice.error} onSubmit={invoice.submit} />
      <FollowupReminderDialog conflict={state.followupConflict} />
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => { if (!open) confirm.close(); }}
        title={reactivating ? t('reactivate_confirm') : t('cancel_confirm')}
        description={reactivating ? t('reactivate_sub', { kind, label: label('to_prepare') }) : t('cancel_sub', { kind })}
        confirmLabel={reactivating ? t('reactivate') : t('cancel_cta')}
        cancelLabel={tc('back')}
        variant={reactivating ? 'default' : 'destructive'}
        onConfirm={() => confirm.run(reactivating ? 'to_prepare' : 'cancelled')}
      />
      {whatsApp.request && order.customer && order.customer_phone && (
        <PreparedMessageDialog
          onClose={whatsApp.close}
          compose={{ ...whatsApp.request, orderId: order.id }}
          contextType="order"
          contextId={order.id}
          customerId={order.customer}
          recipientPhone={order.customer_phone}
          WhatsAppIcon={WhatsAppIcon}
        />
      )}
    </>
  );
}
