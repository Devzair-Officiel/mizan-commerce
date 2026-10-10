'use client';

import { useTranslations } from 'next-intl';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { useFormatDateTime, useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import type { OrderSummary } from '@/lib/hooks/useOrders';
import type { DataTableColumn } from '@/components/list/dataTableTypes';
import { bucketOf } from './bucket';
import { PAYMENT_BADGE, STATUS_BAR } from './constants';

function itemsPreview(order: OrderSummary): string {
  return order.items_preview
    .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name))
    .join(', ');
}

/** Reste dû en centimes entiers, pour éviter les arrondis flottants. */
function amountDue(order: OrderSummary): number {
  const cents = (v: string) => Math.round(Number(v) * 100);
  return (cents(order.total_amount) - cents(order.amount_paid)) / 100;
}

function ClientCell({ order, noClient }: { order: OrderSummary; noClient: string }) {
  const preview = itemsPreview(order);
  return (
    <>
      {order.customer_name
        ? <span className="text-sm font-semibold">{order.customer_name}</span>
        : <span className="text-sm font-medium text-muted-foreground">{noClient}</span>}
      {preview && <span className="mt-0.5 block max-w-85 truncate text-[0.8125rem] text-muted-foreground">{preview}</span>}
    </>
  );
}

function useDateLabel() {
  const t = useTranslations('orders.list');
  const formatDateTime = useFormatDateTime();
  return (iso: string): string => {
    const bucket = bucketOf(iso);
    const time = formatDateTime(iso, { hour: '2-digit', minute: '2-digit' });
    if (bucket === 'today') return t('date_today', { time });
    if (bucket === 'yesterday') return t('date_yesterday', { time });
    const sameYear = new Date(iso).getFullYear() === new Date().getFullYear();
    return formatDateTime(iso, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
  };
}

export function useOrderColumns(currency: string): DataTableColumn<OrderSummary>[] {
  const t = useTranslations('orders.list');
  const tPayment = useTranslations('orders.payment');
  const kind = useCatalogKind();
  const formatMoney = useFormatMoney();
  const label = useOrderStatusLabel();
  const dateLabel = useDateLabel();
  const muted = 'text-[0.8125rem] whitespace-nowrap text-muted-foreground';

  return [
    { key: 'order_number', header: t('column_number'), sortable: true, firstDirection: 'desc',
      cell: (o) => <span className={`${muted} tabular-nums`}>#{o.order_number}</span> },
    { key: 'customer__name', header: t('column_client_items', { kind }), sortable: true, primary: true,
      cell: (o) => <ClientCell order={o} noClient={t('no_client')} /> },
    { key: 'created_at', header: t('column_date'), sortable: true, firstDirection: 'desc',
      cell: (o) => <span className={muted}>{dateLabel(o.created_at)}</span> },
    { key: 'status', header: t('column_status'), sortable: true,
      cell: (o) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap text-[0.8125rem] font-medium">
          <span className={`size-2 shrink-0 rounded-full ${STATUS_BAR[o.status] ?? 'bg-muted-foreground'}`} />
          {label(o.status)}
        </span>
      ) },
    { key: 'payment_status', header: t('column_payment'), sortable: true,
      cell: (o) => o.status === 'cancelled' ? <span className={muted}>{label('cancelled')}</span> : (
        <>
          <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${PAYMENT_BADGE[o.payment_status] ?? ''}`}>
            {tPayment(o.payment_status as 'unpaid' | 'partial' | 'paid')}
          </span>
          {o.payment_status === 'partial' && amountDue(o) > 0 && (
            <span className="mt-0.75 block text-xs text-muted-foreground">
              {t('amount_due', { amount: formatMoney(amountDue(o), currency) })}
            </span>
          )}
        </>
      ) },
    { key: 'total_amount', header: t('column_total'), align: 'end', sortable: true, firstDirection: 'desc',
      cell: (o) => <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatMoney(o.total_amount, currency)}</span> },
  ];
}
