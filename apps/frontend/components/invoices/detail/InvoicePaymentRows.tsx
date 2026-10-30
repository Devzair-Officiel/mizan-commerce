'use client';

import { useTranslations } from 'next-intl';
import { DetailRow } from '@/components/detail/DetailRow';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { getPaymentDisplay } from './payment';

/** Règlement reçu, reste à payer et échéance, sous les totaux d'une facture (`TotalsCard`). */
export function InvoicePaymentRows({ invoice: i }: { invoice: Invoice }) {
  const t = useTranslations('invoices.totals');
  const money = useFormatMoney();
  const date = useFormatDate();
  const payment = getPaymentDisplay(i);
  return <>
    <DetailRow label={t('paid')} className="text-green-700 dark:text-green-400">{money(payment.amountPaid, i.currency)}</DetailRow>
    <DetailRow label={t('remaining')} className={payment.remaining > 0 ? 'text-amber-700 dark:text-amber-400' : undefined}>{money(payment.remaining, i.currency)}</DetailRow>
    <DetailRow label={t('due_date')}>{i.due_date ? date(i.due_date, { dateStyle: 'long', timeZone: 'UTC' }) : '—'}</DetailRow>
  </>;
}
