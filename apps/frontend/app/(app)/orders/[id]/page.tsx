'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { XCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useOrder, useTransitionOrder, useUpdatePayment } from '@/lib/hooks/useOrders';
import { useIssueInvoice } from '@/lib/hooks/useInvoices';
import { useShop } from '@/lib/hooks/useShop';
import { ApiError } from '@/lib/api-client';
import { OrderHeroCard } from '@/components/orders/detail/OrderHeroCard';
import { OrderNextStepCard } from '@/components/orders/detail/OrderNextStepCard';
import { OrderItemsCard } from '@/components/orders/detail/OrderItemsCard';
import { OrderPaymentCard } from '@/components/orders/detail/OrderPaymentCard';
import { OrderInvoiceCard } from '@/components/orders/detail/OrderInvoiceCard';
import { OrderNotesCard } from '@/components/orders/detail/OrderNotesCard';
import { OrderActivityTimeline } from '@/components/orders/detail/OrderActivityTimeline';
import { PaymentBottomSheet } from '@/components/orders/detail/PaymentBottomSheet';
import { InvoiceBottomSheet } from '@/components/orders/detail/InvoiceBottomSheet';
import { REVERT_TRANSITION, STATUS_ALLOWS_CANCEL } from '@/components/orders/detail/constants';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations('orders.detail');
  const tRevert = useTranslations('orders.revert');
  const { data: order, isLoading } = useOrder(id);
  const { data: shop } = useShop();
  const transition = useTransitionOrder(id);
  const updatePayment = useUpdatePayment(id);
  const issueInvoice = useIssueInvoice();

  const [paymentPreset, setPaymentPreset] = useState('');
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [showInvoiceSheet, setShowInvoiceSheet] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  if (isLoading) return <><TopBar title={t('topbar')} /><p className="p-4 text-sm text-zinc-400">{t('loading')}</p></>;
  if (!order) return <><TopBar title={t('topbar')} /><p className="p-4 text-sm text-red-500">{t('not_found')}</p></>;

  const totalAmount = parseFloat(order.total_amount);
  const subtotalAmount = parseFloat(order.subtotal);
  const paidAmount = parseFloat(order.amount_paid);
  const discountAmount = parseFloat(order.discount_amount);
  const shippingAmount = parseFloat(order.shipping_amount);
  const remaining = (totalAmount - paidAmount).toFixed(2);
  const canCancel = STATUS_ALLOWS_CANCEL.has(order.status);

  async function handleTransition(status: string) {
    if (status === 'cancelled' && !confirm(t('cancel_confirm'))) return;
    await transition.mutateAsync(status);
  }

  function openPaymentSheet(preset: number) {
    setPaymentPreset(preset % 1 === 0 ? String(preset) : preset.toFixed(2));
    setShowPaymentSheet(true);
  }

  async function handleSubmitPayment(amountInput: string) {
    if (!order) return;
    const val = parseFloat(amountInput);
    if (!amountInput || Number.isNaN(val) || val === 0) return;
    const newPaid = Math.max(0, parseFloat(order.amount_paid) + val).toFixed(2);
    await updatePayment.mutateAsync(newPaid);
    setShowPaymentSheet(false);
  }

  function openInvoiceSheet() {
    setInvoiceError(null);
    setShowInvoiceSheet(true);
  }

  async function handleIssueInvoice({ taxRate, termsDays, notes }: { taxRate: string; termsDays: string; notes: string }) {
    if (!order) return;
    setInvoiceError(null);
    try {
      const invoice = await issueInvoice.mutateAsync({
        order_id: order.id,
        tax_rate: taxRate || undefined,
        payment_terms_days: termsDays ? Number(termsDays) : undefined,
        notes,
      });
      setShowInvoiceSheet(false);
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const existingId = (err.data as { existing_id?: string } | null)?.existing_id;
        if (existingId) {
          setShowInvoiceSheet(false);
          router.push(`/invoices/${existingId}`);
          return;
        }
      }
      setInvoiceError(err instanceof Error ? err.message : t('invoice_error_generic'));
    }
  }

  const revert = REVERT_TRANSITION[order.status];

  return (
    <>
      <TopBar
        title={order.order_number}
        action={
          order.status === 'draft' && (
            <button onClick={() => router.push(`/orders/${id}/edit`)} className="text-sm font-medium text-primary">
              {t('edit')}
            </button>
          )
        }
      />
      <div className="flex flex-col gap-4 p-4">
        <OrderHeroCard order={order} remaining={remaining} />

        <OrderNextStepCard
          status={order.status}
          isPending={transition.isPending}
          onTransition={handleTransition}
        />

        <OrderItemsCard
          order={order}
          totalAmount={totalAmount}
          subtotalAmount={subtotalAmount}
          discountAmount={discountAmount}
          shippingAmount={shippingAmount}
        />

        <OrderPaymentCard
          order={order}
          totalAmount={totalAmount}
          paidAmount={paidAmount}
          remaining={remaining}
          isPending={updatePayment.isPending}
          onCollect={openPaymentSheet}
        />

        <OrderInvoiceCard
          order={order}
          isPending={issueInvoice.isPending}
          onIssue={openInvoiceSheet}
        />

        <OrderNotesCard orderId={id} />

        <OrderActivityTimeline orderId={id} />

        {revert && (
          <button
            onClick={() => handleTransition(revert.status)}
            disabled={transition.isPending}
            className="text-xs text-muted-foreground underline underline-offset-2 text-center py-1 disabled:opacity-40"
          >
            ↩ {tRevert(revert.key)}
          </button>
        )}

        {canCancel && (
          <div className="mt-4 pt-4 border-t border-zinc-200 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t('danger_zone')}
            </p>
            <Button
              variant="outline"
              className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 inline-flex items-center justify-center gap-2"
              onClick={() => handleTransition('cancelled')}
              disabled={transition.isPending}
            >
              <XCircle size={16} />
              {t('cancel_cta')}
            </Button>
            <p className="text-xs text-zinc-400 px-1">{t('cancel_sub')}</p>
          </div>
        )}
      </div>

      <PaymentBottomSheet
        open={showPaymentSheet}
        onClose={() => setShowPaymentSheet(false)}
        initialAmount={paymentPreset}
        totalAmount={totalAmount}
        paidAmount={paidAmount}
        remaining={remaining}
        isPending={updatePayment.isPending}
        onSubmit={handleSubmitPayment}
      />

      <InvoiceBottomSheet
        open={showInvoiceSheet}
        onClose={() => setShowInvoiceSheet(false)}
        defaultTaxRate={shop?.default_tax_rate ?? '0'}
        defaultTermsDays={String(shop?.default_payment_terms_days ?? 30)}
        isPending={issueInvoice.isPending}
        error={invoiceError}
        onSubmit={handleIssueInvoice}
      />
    </>
  );
}
