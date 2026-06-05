import Link from 'next/link';
import { ArrowRight, CheckCircle2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Order } from '@/lib/hooks/useOrders';

interface OrderInvoiceCardProps {
  order: Order;
  isPending: boolean;
  onIssue: () => void;
}

export function OrderInvoiceCard({ order, isPending, onIssue }: OrderInvoiceCardProps) {
  if (order.status === 'cancelled' || order.items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Receipt size={14} />
          Facturation
        </h2>
        {order.invoice && (
          <span className="text-xs font-medium text-zinc-500">N° {order.invoice.number}</span>
        )}
      </div>

      {order.invoice ? (
        <Link
          href={`/invoices/${order.invoice.id}`}
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 hover:border-primary/40 transition-colors"
        >
          <CheckCircle2 className="text-green-600 shrink-0" size={18} />
          <div className="flex flex-1 flex-col gap-0.5 min-w-0">
            <p className="text-sm font-medium text-zinc-900">
              Facture {order.invoice.status === 'paid' ? 'payée' : order.invoice.status === 'cancelled' ? 'annulée' : 'émise'}
            </p>
            <p className="text-xs text-zinc-500">Voir le détail et télécharger le PDF.</p>
          </div>
          <ArrowRight size={16} className="text-zinc-400 shrink-0" />
        </Link>
      ) : (
        <Button
          onClick={onIssue}
          disabled={isPending}
          className="w-full inline-flex items-center justify-center gap-2"
        >
          <Receipt size={16} />
          Émettre une facture
        </Button>
      )}
    </div>
  );
}
