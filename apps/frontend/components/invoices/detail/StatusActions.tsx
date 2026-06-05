import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Invoice } from '@/lib/hooks/useInvoices';

interface StatusActionsProps {
  invoice: Invoice;
  isPending: boolean;
  onMarkPaid: () => void;
  onCancel: () => void;
}

export function StatusActions({ invoice, isPending, onMarkPaid, onCancel }: StatusActionsProps) {
  const isCancelled = invoice.status === 'cancelled';
  const isPaid = invoice.status === 'paid';

  if (isCancelled) return null;

  return (
    <div className="flex flex-col gap-2 mt-2">
      {!isPaid && !invoice.order && (
        <Button
          onClick={onMarkPaid}
          disabled={isPending}
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
        onClick={onCancel}
        disabled={isPending}
        variant="outline"
        className="w-full text-destructive border-destructive/20 hover:bg-destructive/5 inline-flex items-center justify-center gap-2"
      >
        <XCircle size={16} />
        Annuler la facture
      </Button>
    </div>
  );
}
