'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { useFormatMoney, useFormatDate } from '@/lib/hooks/useFormat';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { InvoiceStatusBadge } from '../shared/InvoiceStatusBadge';
import { InvoicePaymentBadge } from '../shared/InvoicePaymentBadge';
import { invoiceHref } from '../shared/status';

export function InvoiceRow({ invoice: i }: { invoice: Invoice }) {
  const t = useTranslations('invoices');
  const money = useFormatMoney();
  const date = useFormatDate();
  return <Link href={invoiceHref(i)} className={`flex flex-col gap-2.5 px-4 py-3.5 active:bg-muted transition-colors ${i.status === 'cancelled' ? 'text-muted-foreground' : 'text-foreground'}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-semibold break-words">{i.number ? <OrderNumber>{i.number}</OrderNumber> : t('list.no_number')}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{i.buyer_name || t('list.no_customer')}</p></div>
      <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{money(i.total_ttc, i.currency)}</span>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><InvoiceStatusBadge status={i.status} /><InvoicePaymentBadge invoice={i} /></div>
    {i.due_date && <p className="text-xs text-muted-foreground">{t('due', { date: date(i.due_date, { dateStyle: 'medium', timeZone: 'UTC' }) })}</p>}
  </Link>;
}
