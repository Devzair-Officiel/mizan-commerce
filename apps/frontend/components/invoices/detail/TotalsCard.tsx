import { formatInvoiceMoney, type Invoice } from '@/lib/hooks/useInvoices';

interface TotalsCardProps {
  invoice: Invoice;
  showPaymentBreakdown: boolean;
  amountPaid: number;
  remaining: number;
}

export function TotalsCard({ invoice, showPaymentBreakdown, amountPaid, remaining }: TotalsCardProps) {
  const taxRate = parseFloat(invoice.tax_rate);

  return (
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
            <span className="tabular-nums">{formatInvoiceMoney(amountPaid, invoice.currency)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-amber-700">
            <span>Reste à payer</span>
            <span className="tabular-nums">{formatInvoiceMoney(remaining, invoice.currency)}</span>
          </div>
        </>
      )}
    </div>
  );
}
