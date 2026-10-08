'use client';

import { useTranslations } from 'next-intl';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { OrdersTableRow } from './OrdersTableRow';
import type { OrderSummary } from '@/lib/hooks/useOrders';

interface Props { orders: OrderSummary[]; currency: string; }

export function OrdersTable({ orders, currency }: Props) {
  const t = useTranslations('orders.list');
  const kind = useCatalogKind();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden overflow-x-auto">
      <table className="w-full min-w-160 border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('column_number')}</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('column_client_items', { kind })}</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('column_date')}</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('column_preparation')}</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('column_payment')}</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('column_total')}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <OrdersTableRow key={order.id} order={order} currency={currency} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
