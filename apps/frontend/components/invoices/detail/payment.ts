import type { Invoice } from '@/lib/hooks/useInvoices';

export type PaymentDisplay = 'paid' | 'partial' | 'unpaid' | 'cancelled' | 'credited';

/** Montant décimal en centimes : les comparaisons au net dû nul restent exactes. */
const cents = (value: string | null | undefined) => Math.round(parseFloat(value || '0') * 100);

/**
 * État de paiement affiché ; libellé sous `invoices.payment` (ICU select sur `state`).
 * Net dû = TTC − avoirs − règlements, jamais négatif (D10). « Créditée » (D6) : même règle
 * que le PDF (`pdf_blocks.status_key`) — entièrement créditée (`FULLY_CREDITED`), ou émise
 * et soldée par avoirs et règlements.
 */
export function getPaymentDisplay(invoice: Invoice): {
  state: PaymentDisplay;
  amountPaid: number;
  credited: number;
  remaining: number;
} {
  const paid = cents(invoice.amount_paid);
  const credited = cents(invoice.credited_total);
  const net = invoice.status === 'issued' ? Math.max(cents(invoice.total_ttc) - credited - paid, 0) : 0;
  const amounts = { amountPaid: paid / 100, credited: credited / 100, remaining: net / 100 };
  if (invoice.fully_credited || (invoice.status === 'issued' && credited > 0 && net === 0)) return { state: 'credited', ...amounts };
  if (invoice.status === 'cancelled') return { state: 'cancelled', ...amounts };
  if (invoice.status === 'paid') return { state: 'paid', ...amounts };
  if (paid > 0 && net > 0) return { state: 'partial', ...amounts };
  return { state: 'unpaid', ...amounts };
}
