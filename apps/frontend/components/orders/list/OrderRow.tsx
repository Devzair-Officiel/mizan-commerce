import Link from 'next/link';
import type { OrderSummary } from '@/lib/hooks/useOrders';
import { rowDate } from './bucket';
import { getAlert } from './alert';
import { type Bucket, PAYMENT_COLOR, PAYMENT_LABEL, STATUS_BAR, STATUS_TEXT } from './constants';

interface OrderRowProps {
  order: OrderSummary;
  bucket: Bucket;
  first: boolean;
}

export function OrderRow({ order, bucket, first }: OrderRowProps) {
  const total = parseFloat(order.total_amount).toFixed(2);
  const time = rowDate(order.created_at, bucket);
  const itemLabel = `${order.item_count} ${order.item_count > 1 ? 'articles' : 'article'}`;
  const alert = getAlert(order);

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
            {order.customer_name ?? 'Sans client'}
          </span>
          <span className="text-[11px] text-muted-foreground/70 tabular-nums shrink-0">
            #{order.order_number}
          </span>
          {alert && (
            <span
              aria-label={alert.label}
              title={alert.label}
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
        <span className="text-sm font-semibold text-foreground tabular-nums">{total} €</span>
        <span className={`text-[11px] font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
          {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
        </span>
      </div>
    </Link>
  );
}
