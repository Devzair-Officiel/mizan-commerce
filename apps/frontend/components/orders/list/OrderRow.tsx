'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatDateTime, useFormatMoney } from '@/lib/hooks/useFormat';
import type { OrderSummary } from '@/lib/hooks/useOrders';
import { getAlert } from './alert';
import { type Bucket, PAYMENT_COLOR, STATUS_BAR, STATUS_TEXT } from './constants';

interface OrderRowProps {
  order: OrderSummary;
  bucket: Bucket;
  first: boolean;
  currency: string;
}

const PAYMENT_KEYS = ['unpaid', 'partial', 'paid'] as const;
type PaymentKey = typeof PAYMENT_KEYS[number];

export function OrderRow({ order, bucket, first, currency }: OrderRowProps) {
  const tList = useTranslations('orders.list');
  const tPayment = useTranslations('orders.payment');
  const tAlert = useTranslations('orders.alert');
  const formatMoney = useFormatMoney();
  const formatDateTime = useFormatDateTime();

  const total = formatMoney(order.total_amount, currency, { maximumFractionDigits: 2 });
  const dateOpts: Intl.DateTimeFormatOptions =
    bucket === 'today' || bucket === 'yesterday'
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short' };
  const time = formatDateTime(order.created_at, dateOpts);
  const itemLabel = tList('items', { count: order.item_count });
  const alert = getAlert(order);
  const alertLabel = alert ? tAlert(alert.key) : '';
  const isPaymentKey = (s: string): s is PaymentKey => (PAYMENT_KEYS as readonly string[]).includes(s);
  const paymentLabel = isPaymentKey(order.payment_status)
    ? tPayment(order.payment_status)
    : order.payment_status;

  return (
    <Link
      href={`/orders/${order.id}`}
      className={`flex items-stretch gap-3 px-4 py-3.5 active:bg-muted transition-colors ${
        first ? '' : 'border-t border-border'
      }`}
    >
      <div className={`w-1 rounded-full shrink-0 ${STATUS_BAR[order.status] ?? STATUS_BAR.draft}`} />

      <div className="flex-1 min-w-0 self-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground capitalize truncate">
            {order.customer_name ?? tList('no_client')}
          </span>
          <span className="text-[11px] text-muted-foreground/70 tabular-nums shrink-0">
            #{order.order_number}
          </span>
          {alert && (
            <span
              aria-label={alertLabel}
              title={alertLabel}
              className={`inline-flex shrink-0 ${alert.colorClass}`}
            >
              {alert.icon}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate">
          <span className={`font-medium ${STATUS_TEXT[order.status] ?? STATUS_TEXT.draft}`}>
            {order.status_display}
          </span>
          <span className="text-muted-foreground"> · {time} · {itemLabel}</span>
        </p>
      </div>

      <div className="flex flex-col items-end shrink-0 self-center leading-tight">
        <span className="text-sm font-semibold text-foreground tabular-nums">{total}</span>
        <span className={`text-[11px] font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
          {paymentLabel}
        </span>
      </div>
    </Link>
  );
}
