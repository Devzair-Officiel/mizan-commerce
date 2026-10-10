'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { OrderPaymentBadge } from '@/components/orders/list/OrderPaymentBadge';
import type { OrderSummary } from '@/lib/hooks/useOrders';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { cn } from '@/lib/utils';
import { OrderStatusDot } from './OrderStatusDot';

const TH = 'px-4 py-2.5 text-start text-xs font-medium text-muted-foreground first:ps-5 last:pe-5 last:text-end';
const TD = 'px-4 py-3 align-middle text-sm first:ps-5 last:pe-5 last:text-end';

/** Tableau compact des commandes du client (desktop) : n°, date, statut, paiement, total. */
export function CustomerOrdersTable({ orders, currency }: { orders: OrderSummary[]; currency: string }) {
  const t = useTranslations('customers.detail');
  const router = useRouter();
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();
  return (
    <table className="hidden w-full border-collapse lg:table">
      <thead className="bg-muted">
        <tr>
          {(['col_number', 'col_date', 'col_status', 'col_payment', 'col_total'] as const).map((k) => <th key={k} className={TH}>{t(k)}</th>)}
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) router.push(`/orders/${o.id}`); }}
            className={cn('cursor-pointer border-t border-border transition-colors hover:bg-muted/50', o.status === 'cancelled' && 'text-muted-foreground')}>
            <td className={cn(TD, 'font-semibold')}><Link href={`/orders/${o.id}`} className="focus-visible:underline focus-visible:outline-none">{o.order_number}</Link></td>
            <td className={cn(TD, 'whitespace-nowrap')}>{formatDate(o.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td className={TD}><OrderStatusDot status={o.status} /></td>
            <td className={TD}><OrderPaymentBadge order={o} currency={currency} showDue={false} /></td>
            <td className={cn(TD, 'whitespace-nowrap font-semibold tabular-nums')}>{formatMoney(o.total_amount, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
