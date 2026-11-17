'use client';

import { useTranslations } from 'next-intl';
import { useFormatMoney, useFormatShopDate, useFormatDate } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import type { DataTableColumn } from '@/components/list/dataTableTypes';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { InvoiceStatusBadge } from '../shared/InvoiceStatusBadge';
import { InvoicePaymentBadge } from '../shared/InvoicePaymentBadge';
import { CreditNoteBadge } from '../shared/CreditNoteBadge';
import { NegativeAmount } from '../shared/NegativeAmount';

export function useInvoiceColumns(): DataTableColumn<Invoice>[] {
  const t = useTranslations('invoices.list');
  const money = useFormatMoney();
  const date = useFormatShopDate();
  const calendarDate = useFormatDate();
  return [
    { key: 'number', header: t('columns.number'), sortable: true, primary: true,
      cell: i => <span className="text-sm font-semibold whitespace-nowrap">{i.number ? <OrderNumber>{i.number}</OrderNumber> : t('no_number')}</span> },
    { key: 'buyer_name', header: t('columns.buyer_name'), sortable: true,
      cell: i => <span className="text-sm font-medium">{i.buyer_name || t('no_customer')}</span> },
    { key: 'issued_at', header: t('columns.issued_at'), sortable: true, firstDirection: 'desc',
      cell: i => <span className="whitespace-nowrap text-[0.8125rem] text-muted-foreground">{i.issued_at ? date(i.issued_at, { dateStyle: 'medium' }) : '—'}</span> },
    { key: 'due_date', header: t('columns.due_date'), sortable: true, firstDirection: 'desc',
      cell: i => <span className="whitespace-nowrap text-[0.8125rem] text-muted-foreground">{i.due_date ? calendarDate(i.due_date, { dateStyle: 'medium', timeZone: 'UTC' }) : '—'}</span> },
    { key: 'total_ttc', header: t('columns.total_ttc'), sortable: true, align: 'end', firstDirection: 'desc',
      // Avoir : signe affiché seulement, le tri par montant reste sur le TTC positif du serveur.
      cell: i => i.kind === 'credit_note' ? <NegativeAmount value={i.total_ttc} currency={i.currency} className="whitespace-nowrap text-sm font-semibold" />
        : <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{money(i.total_ttc, i.currency)}</span> },
    { key: 'status', header: t('columns.status'), sortable: true,
      cell: i => i.kind === 'credit_note' ? <CreditNoteBadge /> : <InvoiceStatusBadge status={i.status} /> },
    { key: 'payment', header: t('payment_title'), cell: i => i.kind === 'credit_note' ? null : <InvoicePaymentBadge invoice={i} /> },
  ];
}
