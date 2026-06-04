'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  Download,
  Receipt,
  ShoppingBag,
  User,
  XCircle,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import {
  formatInvoiceMoney,
  useInvoice,
  useUpdateInvoiceStatus,
  type Invoice,
} from '@/lib/hooks/useInvoices';

type PaymentDisplay = 'paid' | 'partial' | 'unpaid' | 'cancelled';

const PILL_CLASS: Record<PaymentDisplay, string> = {
  paid: 'bg-green-50 text-green-700 border border-green-100',
  partial: 'bg-amber-50 text-amber-700 border border-amber-100',
  unpaid: 'bg-blue-50 text-blue-700 border border-blue-100',
  cancelled: 'bg-red-50 text-red-600 border border-red-100',
};

function getPaymentDisplay(invoice: Invoice): {
  state: PaymentDisplay;
  label: string;
  amountPaid: number;
  remaining: number;
} {
  const amountPaid = parseFloat(invoice.amount_paid || '0');
  const totalTtc = parseFloat(invoice.total_ttc || '0');
  const remaining = Math.max(totalTtc - amountPaid, 0);
  if (invoice.status === 'cancelled') {
    return { state: 'cancelled', label: 'Annulée', amountPaid, remaining };
  }
  if (invoice.status === 'paid') {
    return { state: 'paid', label: 'Payée', amountPaid, remaining };
  }
  if (amountPaid > 0 && remaining > 0) {
    return {
      state: 'partial',
      label: `Partiel — ${formatInvoiceMoney(amountPaid, invoice.currency)}`,
      amountPaid,
      remaining,
    };
  }
  return { state: 'unpaid', label: 'Non payée', amountPaid, remaining };
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric',
});

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading } = useInvoice(id);
  const updateStatus = useUpdateInvoiceStatus(id);

  if (isLoading) {
    return (
      <>
        <TopBar title="Facture" />
        <p className="p-4 text-sm text-muted-foreground">Chargement…</p>
      </>
    );
  }

  if (!invoice) {
    return (
      <>
        <TopBar title="Facture" />
        <p className="p-4 text-sm text-destructive">Facture introuvable.</p>
      </>
    );
  }

  const taxRate = parseFloat(invoice.tax_rate);
  const isCancelled = invoice.status === 'cancelled';
  const isPaid = invoice.status === 'paid';
  const payment = getPaymentDisplay(invoice);
  const showPaymentBreakdown = payment.state === 'partial';

  async function handleMarkPaid() {
    if (!confirm('Marquer cette facture comme payée ?')) return;
    await updateStatus.mutateAsync('paid');
  }

  async function handleCancel() {
    if (!confirm('Annuler cette facture ? Le numéro reste réservé et la trace est conservée.')) return;
    await updateStatus.mutateAsync('cancelled');
  }

  return (
    <>
      <TopBar title={invoice.number} />
      <div className="flex flex-col gap-4 p-4 pb-24">
        {/* Hero */}
        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${PILL_CLASS[payment.state]}`}
            >
              <Receipt size={13} />
              {payment.label}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Émise le {DATE_FMT.format(new Date(invoice.issued_at))}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-3xl font-bold text-foreground tabular-nums">
              {formatInvoiceMoney(invoice.total_ttc, invoice.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              Échéance&nbsp;: {DATE_FMT.format(new Date(invoice.due_date))}
            </p>
          </div>

          {/* Actions principales */}
          <div className="flex gap-2">
            <a
              href={`/api/proxy/invoices/${invoice.id}/pdf/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-md bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors"
            >
              <Download size={16} />
              Télécharger PDF
            </a>
          </div>
        </div>

        {/* Vendeur / Client */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PartyCard
            title="Vendeur"
            name={invoice.seller_name}
            address={invoice.seller_address}
            extras={[invoice.seller_tax_id]}
          />
          <PartyCard
            title="Client"
            name={invoice.buyer_name || '—'}
            address={invoice.buyer_address}
            extras={[invoice.buyer_email, invoice.buyer_phone]}
          />
        </div>

        {/* Lignes */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Détail
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {invoice.lines.map((line) => (
              <li key={line.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex flex-1 flex-col min-w-0">
                  <p className="text-sm font-medium text-foreground">{line.description}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {parseFloat(line.quantity)} × {formatInvoiceMoney(line.unit_price_ht, invoice.currency)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {formatInvoiceMoney(line.line_subtotal_ht, invoice.currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Totaux */}
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Sous-total HT</span>
            <span className="tabular-nums">{formatInvoiceMoney(invoice.subtotal_ht, invoice.currency)}</span>
          </div>
          {parseFloat(invoice.discount_amount) > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Remise</span>
              <span className="tabular-nums">− {formatInvoiceMoney(invoice.discount_amount, invoice.currency)}</span>
            </div>
          )}
          {parseFloat(invoice.shipping_amount) > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Frais de port</span>
              <span className="tabular-nums">{formatInvoiceMoney(invoice.shipping_amount, invoice.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{taxRate > 0 ? `TVA ${taxRate}%` : 'TVA'}</span>
            <span className="tabular-nums">
              {taxRate > 0 ? formatInvoiceMoney(invoice.tax_amount, invoice.currency) : 'Non applicable'}
            </span>
          </div>
          <div className="flex justify-between text-base font-bold text-foreground pt-2 border-t border-border">
            <span>Total TTC</span>
            <span className="tabular-nums">{formatInvoiceMoney(invoice.total_ttc, invoice.currency)}</span>
          </div>
          {showPaymentBreakdown && (
            <>
              <div className="flex justify-between text-sm text-muted-foreground pt-1">
                <span>Payé</span>
                <span className="tabular-nums">{formatInvoiceMoney(payment.amountPaid, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-amber-700">
                <span>Reste à payer</span>
                <span className="tabular-nums">{formatInvoiceMoney(payment.remaining, invoice.currency)}</span>
              </div>
            </>
          )}
        </div>

        {/* Notes / mentions légales */}
        {invoice.notes && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notes</h2>
            <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
        {invoice.seller_legal_mentions && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Mentions légales
            </h2>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {invoice.seller_legal_mentions}
            </p>
          </div>
        )}

        {/* Liens rapides */}
        <div className="flex flex-col gap-2">
          {invoice.order && (
            <Link
              href={`/orders/${invoice.order}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
            >
              <ShoppingBag className="text-muted-foreground shrink-0" size={18} />
              <p className="text-sm font-medium text-foreground flex-1">Voir la commande liée</p>
            </Link>
          )}
          {invoice.customer && (
            <Link
              href={`/customers/${invoice.customer}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
            >
              <User className="text-muted-foreground shrink-0" size={18} />
              <p className="text-sm font-medium text-foreground flex-1">Fiche client</p>
            </Link>
          )}
        </div>

        {/* Actions statut */}
        {!isCancelled && (
          <div className="flex flex-col gap-2 mt-2">
            {!isPaid && !invoice.order && (
              <Button
                onClick={handleMarkPaid}
                disabled={updateStatus.isPending}
                className="w-full bg-green-600 hover:bg-green-700 text-white inline-flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} />
                Marquer comme payée
              </Button>
            )}
            {invoice.order && !isPaid && (
              <p className="text-[11px] text-muted-foreground text-center px-2">
                Le statut de paiement est piloté par la commande liée.
              </p>
            )}
            <Button
              onClick={handleCancel}
              disabled={updateStatus.isPending}
              variant="outline"
              className="w-full text-destructive border-destructive/20 hover:bg-destructive/5 inline-flex items-center justify-center gap-2"
            >
              <XCircle size={16} />
              Annuler la facture
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function PartyCard({
  title,
  name,
  address,
  extras,
}: {
  title: string;
  name: string;
  address: string;
  extras: (string | undefined)[];
}) {
  const visibleExtras = extras.filter(Boolean) as string[];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
      <p className="text-sm font-semibold text-foreground">{name}</p>
      {address && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{address}</p>
      )}
      {visibleExtras.map((extra) => (
        <p key={extra} className="text-xs text-muted-foreground">
          {extra}
        </p>
      ))}
    </div>
  );
}
