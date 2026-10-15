import type { Invoice } from '@/lib/hooks/useInvoices';

export type PaymentDisplay = 'paid' | 'partial' | 'unpaid' | 'cancelled';

/** État de paiement affiché ; libellé sous `invoices.payment` (ICU select sur `state`). */
export function getPaymentDisplay(invoice: Invoice): {
  state: PaymentDisplay;
  amountPaid: number;
  remaining: number;
} {
  const amountPaid = parseFloat(invoice.amount_paid || '0');
  const totalTtc = parseFloat(invoice.total_ttc || '0');
  const remaining = invoice.status === 'issued' ? Math.max(totalTtc - amountPaid, 0) : 0;
  if (invoice.status === 'cancelled') return { state: 'cancelled', amountPaid, remaining };
  if (invoice.status === 'paid') return { state: 'paid', amountPaid, remaining };
  if (amountPaid > 0 && remaining > 0) return { state: 'partial', amountPaid, remaining };
  return { state: 'unpaid', amountPaid, remaining };
}
