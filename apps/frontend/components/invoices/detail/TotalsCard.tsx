import { useTranslations } from 'next-intl';
import { formatInvoiceMoney, type Invoice } from '@/lib/hooks/useInvoices';

interface TotalsCardProps {
  invoice: Invoice;
  showPaymentBreakdown: boolean;
  amountPaid: number;
  remaining: number;
}

export function TotalsCard({ invoice, showPaymentBreakdown, amountPaid, remaining }: TotalsCardProps) {
  const t = useTranslations('invoices.totals');
  const taxRate = parseFloat(invoice.tax_rate);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{t('subtotal')}</span>
        <span className="tabular-nums">{formatInvoiceMoney(invoice.subtotal_ht, invoice.currency)}</span>
      </div>
      {parseFloat(invoice.discount_amount) > 0 && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{t('discount')}</span>
          <span className="tabular-nums">− {formatInvoiceMoney(invoice.discount_amount, invoice.currency)}</span>
        </div>
      )}
      {parseFloat(invoice.shipping_amount) > 0 && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{t('shipping')}</span>
          <span className="tabular-nums">{formatInvoiceMoney(invoice.shipping_amount, invoice.currency)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{taxRate > 0 ? t('tax_rate', { rate: taxRate }) : t('tax')}</span>
        <span className="tabular-nums">
          {taxRate > 0 ? formatInvoiceMoney(invoice.tax_amount, invoice.currency) : t('not_applicable')}
        </span>
      </div>
      <div className="flex justify-between text-base font-bold text-foreground pt-2 border-t border-border">
        <span>{t('total')}</span>
        <span className="tabular-nums">{formatInvoiceMoney(invoice.total_ttc, invoice.currency)}</span>
      </div>
      {showPaymentBreakdown && (
        <>
          <div className="flex justify-between text-sm text-muted-foreground pt-1">
            <span>{t('paid')}</span>
            <span className="tabular-nums">{formatInvoiceMoney(amountPaid, invoice.currency)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-amber-700 dark:text-amber-400">
            <span>{t('remaining')}</span>
            <span className="tabular-nums">{formatInvoiceMoney(remaining, invoice.currency)}</span>
          </div>
        </>
      )}
    </div>
  );
}
