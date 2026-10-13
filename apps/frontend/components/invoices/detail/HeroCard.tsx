import { useTranslations } from 'next-intl';
import { Download, Receipt } from 'lucide-react';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { formatInvoiceMoney, type Invoice } from '@/lib/hooks/useInvoices';
import {
  INVOICE_DATE_OPTIONS,
  PAYMENT_PILL_CLASS,
  type PaymentDisplay,
} from './payment';

interface HeroCardProps {
  invoice: Invoice;
  payment: { state: PaymentDisplay; amountPaid: number };
}

export function HeroCard({ invoice, payment }: HeroCardProps) {
  const t = useTranslations('invoices');
  const formatDate = useFormatDate();
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${PAYMENT_PILL_CLASS[payment.state]}`}
        >
          <Receipt size={13} />
          {t('payment', { state: payment.state, amount: formatInvoiceMoney(payment.amountPaid, invoice.currency) })}
        </span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {t('detail.issued_on', { date: formatDate(invoice.issued_at, INVOICE_DATE_OPTIONS) })}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-3xl font-bold text-foreground tabular-nums">
          {formatInvoiceMoney(invoice.total_ttc, invoice.currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('due', { date: formatDate(invoice.due_date, INVOICE_DATE_OPTIONS) })}
        </p>
      </div>

      <div className="flex gap-2">
        <a
          href={`/api/proxy/invoices/${invoice.id}/pdf/`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-md bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors"
        >
          <Download size={16} />
          {t('detail.download_pdf')}
        </a>
      </div>
    </div>
  );
}
