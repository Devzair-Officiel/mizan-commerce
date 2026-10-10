'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/dialog';
import { PreparedMessageDialog } from '@/components/messages/PreparedMessageDialog';
import type { Order } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { remainingDue, WhatsAppIcon } from './constants';
import { InvoiceBottomSheet } from './InvoiceBottomSheet';
import { PaymentBottomSheet } from './PaymentBottomSheet';
import type { OrderDetailState } from './useOrderDetailState';
import { buildWhatsAppMessage } from './whatsapp';

type DialogsState = Pick<OrderDetailState, 'payment' | 'invoice' | 'confirm' | 'whatsApp'>;

/** Fenêtres de la page détail : encaissement, facture, confirmations, message WhatsApp. */
export function OrderDetailDialogs({ order, state }: { order: Order; state: DialogsState }) {
  const t = useTranslations('orders.detail');
  const tWa = useTranslations('orders.whatsapp');
  const tc = useTranslations('layout.common');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const currency = shop?.currency ?? 'EUR';
  const { payment, invoice, confirm, whatsApp } = state;
  const kind = shop?.catalog_kind ?? 'both';
  const reactivating = confirm.kind === 'reactivate';

  return (
    <>
      <PaymentBottomSheet open={payment.open} onClose={payment.close} initialAmount={payment.preset}
        totalAmount={parseFloat(order.total_amount)} paidAmount={parseFloat(order.amount_paid)}
        remaining={remainingDue(order).toFixed(2)} isPending={payment.isPending} onSubmit={payment.submit} />
      <InvoiceBottomSheet open={invoice.open} onClose={invoice.close}
        defaultTaxRate={shop?.default_tax_rate ?? '0'} defaultTermsDays={String(shop?.default_payment_terms_days ?? 30)}
        isPending={invoice.isPending} error={invoice.error} onSubmit={invoice.submit} />
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
      {order.customer && order.customer_phone && (
        <PreparedMessageDialog
          open={whatsApp.template !== null}
          onClose={whatsApp.close}
          templateType={whatsApp.template ?? 'order_confirmation'}
          contextType="order"
          contextId={order.id}
          customerId={order.customer}
          recipientPhone={order.customer_phone}
          initialMessage={buildWhatsAppMessage(order, { tWa, formatMoney, formatDate, currency })}
          WhatsAppIcon={WhatsAppIcon}
        />
      )}
    </>
  );
}
