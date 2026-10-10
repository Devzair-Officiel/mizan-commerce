'use client';

import { useTranslations } from 'next-intl';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { CustomerSummary } from '@/lib/hooks/useCustomers';
import type { DataTableColumn } from '@/components/list/dataTableTypes';
import { CustomerAvatar } from '../CustomerAvatar';

function ClientCell({ customer, noPhone }: { customer: CustomerSummary; noPhone: string }) {
  return (
    <span className="flex items-center gap-3">
      <CustomerAvatar name={customer.name} className="size-9 text-xs" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold capitalize">{customer.name}</span>
        <span className="mt-0.5 block truncate text-[0.8125rem] text-muted-foreground" dir="ltr">
          {customer.phone || noPhone}
        </span>
      </span>
    </span>
  );
}

export function useCustomerColumns(currency: string): DataTableColumn<CustomerSummary>[] {
  const t = useTranslations('customers.list');
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const muted = 'text-[0.8125rem] whitespace-nowrap text-muted-foreground';
  const dash = <span className={muted} aria-label={t('none')}>—</span>;
  const lastOrder = (iso: string): string => {
    const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
    return formatDate(iso, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
  };

  return [
    { key: 'name', header: t('column_client'), sortable: true, primary: true,
      cell: (c) => <ClientCell customer={c} noPhone={t('phone_missing')} /> },
    { key: 'city', header: t('column_city'),
      cell: (c) => (c.city ? <span className={muted}>{c.city}</span> : dash) },
    { key: 'order_count', header: t('column_orders'), align: 'end', sortable: true, firstDirection: 'desc',
      cell: (c) => <span className="text-sm tabular-nums">{c.order_count}</span> },
    { key: 'last_order_at', header: t('column_last_order'), sortable: true, firstDirection: 'desc',
      cell: (c) => (c.last_order_at ? <span className={muted}>{lastOrder(c.last_order_at)}</span> : dash) },
    { key: 'paid_amount', header: t('column_paid'), align: 'end', sortable: true, firstDirection: 'desc',
      cell: (c) => <span className="whitespace-nowrap text-sm tabular-nums">{formatMoney(c.paid_amount, currency)}</span> },
    { key: 'pending_amount', header: t('column_pending'), align: 'end', sortable: true, firstDirection: 'desc',
      cell: (c) => (parseFloat(c.pending_amount) > 0
        ? <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">{formatMoney(c.pending_amount, currency)}</span>
        : dash) },
  ];
}
