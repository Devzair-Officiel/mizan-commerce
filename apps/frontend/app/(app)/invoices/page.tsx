'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, CircleDashed, FileText, Hourglass, XCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import {
  formatInvoiceMoney,
  useInvoices,
  type Invoice,
  type InvoiceStatus,
} from '@/lib/hooks/useInvoices';

type PaymentDisplay = 'paid' | 'partial' | 'unpaid' | 'cancelled';

const PILL_CLASS: Record<PaymentDisplay, string> = {
  paid: 'bg-green-50 text-green-700 border border-green-100',
  partial: 'bg-amber-50 text-amber-700 border border-amber-100',
  unpaid: 'bg-blue-50 text-blue-700 border border-blue-100',
  cancelled: 'bg-red-50 text-red-600 border border-red-100',
};

const PILL_ICON: Record<PaymentDisplay, React.ReactNode> = {
  paid: <CheckCircle2 size={13} />,
  partial: <Hourglass size={13} />,
  unpaid: <CircleDashed size={13} />,
  cancelled: <XCircle size={13} />,
};

function getRowPaymentDisplay(invoice: Invoice): { state: PaymentDisplay; label: string } {
  if (invoice.status === 'cancelled') return { state: 'cancelled', label: 'Annulée' };
  if (invoice.status === 'paid') return { state: 'paid', label: 'Payée' };
  const amountPaid = parseFloat(invoice.amount_paid || '0');
  const totalTtc = parseFloat(invoice.total_ttc || '0');
  if (amountPaid > 0 && amountPaid < totalTtc) {
    return { state: 'partial', label: `Partiel — ${formatInvoiceMoney(amountPaid, invoice.currency)}` };
  }
  return { state: 'unpaid', label: 'Non payée' };
}

const FILTERS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'issued', label: 'Émises' },
  { value: 'paid', label: 'Payées' },
  { value: 'cancelled', label: 'Annulées' },
];

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric',
});

export default function InvoicesPage() {
  const [filter, setFilter] = useState<InvoiceStatus | 'all'>('all');
  const { data, isLoading } = useInvoices(filter === 'all' ? undefined : filter);
  const invoices = data?.results ?? [];

  return (
    <>
      <TopBar title="Factures" />
      <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTERS.map(({ value, label }) => (
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
              {label}
            </button>
          ))}
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-6">Chargement…</p>
        )}

        {!isLoading && invoices.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 flex flex-col items-center gap-2 text-center">
            <FileText className="text-muted-foreground" size={32} />
            <p className="text-sm font-medium text-foreground">Aucune facture</p>
            <p className="text-xs text-muted-foreground">
              Les factures se créent depuis une commande.
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
  const issued = DATE_FMT.format(new Date(invoice.issued_at));
  const payment = getRowPaymentDisplay(invoice);
  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{invoice.number}</p>
          <p className="text-xs text-muted-foreground truncate">
            {invoice.buyer_name || 'Sans client'} · {issued}
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
          {payment.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          Échéance&nbsp;: {DATE_FMT.format(new Date(invoice.due_date))}
        </span>
      </div>
    </Link>
  );
}
