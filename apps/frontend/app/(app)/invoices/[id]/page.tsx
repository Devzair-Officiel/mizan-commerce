'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, User } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useInvoice, useUpdateInvoiceStatus } from '@/lib/hooks/useInvoices';
import { getPaymentDisplay } from '@/components/invoices/detail/payment';
import { HeroCard } from '@/components/invoices/detail/HeroCard';
import { PartyCard } from '@/components/invoices/detail/PartyCard';
import { LinesList } from '@/components/invoices/detail/LinesList';
import { TotalsCard } from '@/components/invoices/detail/TotalsCard';
import { StatusActions } from '@/components/invoices/detail/StatusActions';

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
        <HeroCard invoice={invoice} payment={payment} />

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

        <LinesList invoice={invoice} />

        <TotalsCard
          invoice={invoice}
          showPaymentBreakdown={showPaymentBreakdown}
          amountPaid={payment.amountPaid}
          remaining={payment.remaining}
        />

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

        <StatusActions
          invoice={invoice}
          isPending={updateStatus.isPending}
          onMarkPaid={handleMarkPaid}
          onCancel={handleCancel}
        />
      </div>
    </>
  );
}
