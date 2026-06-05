import { formatInvoiceMoney, type Invoice } from '@/lib/hooks/useInvoices';

export type PaymentDisplay = 'paid' | 'partial' | 'unpaid' | 'cancelled';

export const PAYMENT_PILL_CLASS: Record<PaymentDisplay, string> = {
  paid: 'bg-green-50 text-green-700 border border-green-100',
  partial: 'bg-amber-50 text-amber-700 border border-amber-100',
  unpaid: 'bg-blue-50 text-blue-700 border border-blue-100',
  cancelled: 'bg-red-50 text-red-600 border border-red-100',
};

export function getPaymentDisplay(invoice: Invoice): {
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

export const INVOICE_DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric',
});
