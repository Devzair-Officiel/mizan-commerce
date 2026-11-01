'use client';

import { useTranslations } from 'next-intl';
import { DetailRow } from '@/components/detail/DetailRow';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { NegativeAmount } from '../shared/NegativeAmount';
import { getPaymentDisplay } from './payment';

/** Avoirs, règlement reçu, reste à payer net (D10) et échéance, sous les totaux d'une facture (`TotalsCard`). */
export function InvoicePaymentRows({ invoice: i }: { invoice: Invoice }) {
  const t = useTranslations('invoices.totals');
  const tDetail = useTranslations('invoices.detail');
  const money = useFormatMoney();
  const date = useFormatDate();
  const payment = getPaymentDisplay(i);
  return <>
    {payment.credited > 0 && <DetailRow label={tDetail('credited')} className="text-green-700 dark:text-green-400">
      <NegativeAmount value={payment.credited} currency={i.currency} />
    </DetailRow>}
    <DetailRow label={t('paid')} className="text-green-700 dark:text-green-400">{money(payment.amountPaid, i.currency)}</DetailRow>
    <DetailRow label={t('remaining')} className={payment.remaining > 0 ? 'text-amber-700 dark:text-amber-400' : undefined}>{money(payment.remaining, i.currency)}</DetailRow>
    <DetailRow label={t('due_date')}>{i.due_date ? date(i.due_date, { dateStyle: 'long', timeZone: 'UTC' }) : '—'}</DetailRow>
  </>;
}
