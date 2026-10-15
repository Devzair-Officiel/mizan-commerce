'use client';
import { useTranslations } from 'next-intl';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { getPaymentDisplay } from '../detail/payment';
import { PAYMENT_BADGE } from './status';

export function InvoicePaymentBadge({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('invoices');
  const money = useFormatMoney();
  const payment = getPaymentDisplay(invoice);
  return <div className="flex flex-col items-start gap-1">
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${PAYMENT_BADGE[payment.state]}`}>
      {t('payment', { state: payment.state, amount: money(payment.amountPaid, invoice.currency) })}
    </span>
    {payment.state === 'partial' && <span className="text-xs text-amber-700 dark:text-amber-400 tabular-nums">{t('remaining', { amount: money(payment.remaining, invoice.currency) })}</span>}
  </div>;
}
