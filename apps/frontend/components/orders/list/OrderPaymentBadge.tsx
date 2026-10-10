'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { OrderSummary } from '@/lib/hooks/useOrders';
import { PAYMENT_BADGE, type PaymentKey } from './constants';

/** Reste dû en centimes entiers, pour éviter les arrondis flottants. */
function amountDue(order: OrderSummary): number {
  const cents = (v: string) => Math.round(Number(v) * 100);
  return (cents(order.total_amount) - cents(order.amount_paid)) / 100;
}

/** Badge de paiement d'une commande, suivi de « X € dus » si le paiement est partiel (tableau et liste mobile). */
export function OrderPaymentBadge({ order, currency }: { order: OrderSummary; currency: string }) {
  const t = useTranslations('orders.list');
  const tPayment = useTranslations('orders.payment');
  const formatMoney = useFormatMoney();
  const due = order.payment_status === 'partial' ? amountDue(order) : 0;
  return (
    <>
      <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${PAYMENT_BADGE[order.payment_status] ?? ''}`}>
        {tPayment(order.payment_status as PaymentKey)}
      </span>
      {due > 0 && (
        <span className="mt-0.75 block whitespace-nowrap text-xs text-muted-foreground">
          {t('amount_due', { amount: formatMoney(due, currency) })}
        </span>
      )}
    </>
  );
}
