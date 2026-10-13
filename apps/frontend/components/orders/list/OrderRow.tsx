'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatDateTime, useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { cn } from '@/lib/utils';
import type { OrderSummary } from '@/lib/hooks/useOrders';
import { getAlert } from './alert';
import { type Bucket, STATUS_BAR } from './constants';
import { OrderPaymentBadge } from './OrderPaymentBadge';

interface OrderRowProps {
  order: OrderSummary;
  bucket: Bucket;
  first: boolean;
  currency: string;
}

/** Ligne de la liste mobile, même vocabulaire que le tableau : pastille de statut, badge de paiement, annulée atténuée. */
export function OrderRow({ order, bucket, first, currency }: OrderRowProps) {
  const tList = useTranslations('orders.list');
  const tAlert = useTranslations('orders.alert');
  const formatMoney = useFormatMoney();
  const formatDateTime = useFormatDateTime();
  const label = useOrderStatusLabel();
  const kind = useCatalogKind();

  const cancelled = order.status === 'cancelled';
  const time = formatDateTime(order.created_at, bucket === 'today' || bucket === 'yesterday'
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short' });
  const alert = getAlert(order);
  const alertLabel = alert ? tAlert(alert.key) : '';

  return (
    <Link href={`/orders/${order.id}`} className={cn(
      'flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted',
      !first && 'border-t border-border', cancelled && 'text-muted-foreground',
    )}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate font-semibold', !order.customer_name && 'font-medium text-muted-foreground')}>
            {order.customer_name ?? tList('no_client')}
          </span>
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">#{order.order_number}</span>
          {alert && (
            <span aria-label={alertLabel} title={alertLabel} className={`inline-flex shrink-0 ${alert.colorClass}`}>{alert.icon}</span>
          )}
        </div>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-xs">
          <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_BAR[order.status] ?? 'bg-muted-foreground'}`} />
            {label(order.status)}
          </span>
          <span className="truncate text-muted-foreground">· {time} · {tList('items', { count: order.item_count, kind })}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-end">
        <span className="text-sm font-semibold tabular-nums">{formatMoney(order.total_amount, currency, { maximumFractionDigits: 2 })}</span>
        {!cancelled && <OrderPaymentBadge order={order} currency={currency} />}
      </div>
    </Link>
  );
}
