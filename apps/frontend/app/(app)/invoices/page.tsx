'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleDashed, FileText, Hourglass, XCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import {
  formatInvoiceMoney,
  useInvoices,
  type Invoice,
  type InvoiceStatus,
} from '@/lib/hooks/useInvoices';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { getPaymentDisplay, type PaymentDisplay } from '@/components/invoices/detail/payment';
import { SkeletonRows } from '@/components/ui/SkeletonRows';

const PILL_CLASS: Record<PaymentDisplay, string> = {
  paid: 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/25',
  partial: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25',
  unpaid: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/25',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/25',
};

const PILL_ICON: Record<PaymentDisplay, React.ReactNode> = {
  paid: <CheckCircle2 size={13} />,
  partial: <Hourglass size={13} />,
  unpaid: <CircleDashed size={13} />,
  cancelled: <XCircle size={13} />,
};

// Libellés sous `invoices.list.filter` (ICU select sur la valeur).
const FILTERS: (InvoiceStatus | 'all')[] = ['all', 'issued', 'paid', 'cancelled'];

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export default function InvoicesPage() {
  const t = useTranslations('invoices.list');
  const [filter, setFilter] = useState<InvoiceStatus | 'all'>('all');
  const { data, isLoading } = useInvoices(filter === 'all' ? undefined : filter);
  const invoices = data?.results ?? [];

  return (
    <>
      <TopBar title={t('title')} />
      <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40'
              }`}
            >
              {t('filter', { value })}
            </button>
          ))}
        </div>

        {isLoading && <SkeletonRows count={5} variant="cards" rowClassName="px-4 py-3" />}

        {!isLoading && invoices.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 flex flex-col items-center gap-2 text-center">
            <FileText className="text-muted-foreground" size={32} />
            <p className="text-sm font-medium text-foreground">{t('empty_title')}</p>
            <p className="text-xs text-muted-foreground">
              {t('empty_body')}
            </p>
          </div>
        )}

        {!isLoading && invoices.length > 0 && (
          <ul className="flex flex-col gap-2">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <InvoiceRow invoice={inv} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('invoices');
  const formatDate = useFormatDate();
  const issued = formatDate(invoice.issued_at, DATE_OPTIONS);
  const payment = getPaymentDisplay(invoice);
  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{invoice.number}</p>
          <p className="text-xs text-muted-foreground truncate">
            {invoice.buyer_name || t('list.no_customer')} · {issued}
          </p>
        </div>
        <p className="text-base font-semibold text-foreground tabular-nums shrink-0">
          {formatInvoiceMoney(invoice.total_ttc, invoice.currency)}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PILL_CLASS[payment.state]}`}
        >
          {PILL_ICON[payment.state]}
          {t('payment', { state: payment.state, amount: formatInvoiceMoney(payment.amountPaid, invoice.currency) })}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t('due', { date: formatDate(invoice.due_date, DATE_OPTIONS) })}
        </span>
      </div>
    </Link>
  );
}
