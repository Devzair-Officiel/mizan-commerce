'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatDateTime, useFormatMoney } from '@/lib/hooks/useFormat';
import { STATUS_BAR, STATUS_TEXT, PAYMENT_COLOR } from './constants';
import type { OrderSummary } from '@/lib/hooks/useOrders';

interface Props { order: OrderSummary; currency: string; }

export function OrdersTableRow({ order, currency }: Props) {
  const tList = useTranslations('orders.list');
  const tPayment = useTranslations('orders.payment');
  const formatMoney = useFormatMoney();
  const formatDateTime = useFormatDateTime();

  const amountDue = parseFloat(order.total_amount) - parseFloat(order.amount_paid);
  const dateStr = formatDateTime(order.created_at, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <tr className="group border-t border-border hover:bg-muted/50 transition-colors cursor-pointer">
      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        <Link href={`/orders/${order.id}`} className="hover:underline">#{order.order_number}</Link>
      </td>
      <td className="px-4 py-3 min-w-0">
        <Link href={`/orders/${order.id}`} className="block min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {order.customer_name ?? <span className="text-muted-foreground font-normal">{tList('no_client')}</span>}
          </p>
          {order.items_preview.length > 0 && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {order.items_preview.map((item, i) => (
                <span key={i}>{i > 0 && ' · '}{item.quantity}× {item.name}</span>
              ))}
            </p>
          )}
        </Link>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{dateStr}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[order.status] ?? ''}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BAR[order.status] ?? ''}`} />
          {order.status_display}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium ${PAYMENT_COLOR[order.payment_status] ?? ''}`}>
          {tPayment(order.payment_status as 'unpaid' | 'partial' | 'paid')}
        </span>
        {order.payment_status === 'partial' && amountDue > 0 && (
          <p className="text-[11px] text-muted-foreground">{formatMoney(amountDue, currency)} dus</p>
        )}
      </td>
      <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right whitespace-nowrap">
        {formatMoney(order.total_amount, currency)}
      </td>
    </tr>
  );
}
