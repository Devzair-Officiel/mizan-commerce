'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { OrderPaymentBadge } from '@/components/orders/list/OrderPaymentBadge';
import { SectionCard } from '@/components/ui/SectionCard';
import type { Customer } from '@/lib/hooks/useCustomers';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrders } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { cn } from '@/lib/utils';
import { CustomerOrdersTable } from './CustomerOrdersTable';
import { OrderStatusDot } from './OrderStatusDot';

const SHOWN = 5;

/** Carte « Commandes » : les 5 dernières (tableau desktop, lignes mobiles) et « Voir toutes ». */
export function CustomerOrdersCard({ customer }: { customer: Customer }) {
  const t = useTranslations('customers.detail');
  const { data: shop } = useShop();
  const formatDate = useFormatDate();
  const formatMoney = useFormatMoney();
  const { data, isLoading } = useOrders({ customer: customer.id, ordering: '-created_at' });
  const currency = shop?.currency ?? 'EUR';
  const orders = (data?.results ?? []).slice(0, SHOWN);
  const total = data?.count ?? 0;
  const seeAll = total > 0 ? { label: t('see_all_orders', { count: total }), href: `/orders?customer=${customer.id}` } : undefined;

  return (
    <SectionCard title={t('orders_title')} rightLink={seeAll}>
      {isLoading ? (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{t('loading')}</p>
      ) : orders.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground lg:px-5">{t('orders_empty')}</p>
      ) : (
        <>
          <CustomerOrdersTable orders={orders} currency={currency} />
          <ul className="divide-y divide-border lg:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`}
                  className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 active:bg-muted/50', o.status === 'cancelled' && 'text-muted-foreground')}>
                  <span className="truncate text-sm font-semibold">
                    {o.order_number}<span className="font-normal text-muted-foreground"> · {formatDate(o.created_at, { day: 'numeric', month: 'short' })}</span>
                  </span>
                  <span className="text-end text-sm font-semibold tabular-nums">{formatMoney(o.total_amount, currency)}</span>
                  <OrderStatusDot status={o.status} />
                  <span className="text-end"><OrderPaymentBadge order={o} currency={currency} showDue={false} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
