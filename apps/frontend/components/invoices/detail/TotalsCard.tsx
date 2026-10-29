'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { DetailRow } from '@/components/detail/DetailRow';
import { useFormatDate, useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { InvoicePaymentBadge } from '../shared/InvoicePaymentBadge';
import { getPaymentDisplay } from './payment';

export function TotalsCard({ invoice: i }: { invoice: Invoice }) {
  const t = useTranslations('invoices.totals');
  const money = useFormatMoney();
  const date = useFormatDate();
  const m = (value: string | number) => money(value, i.currency);
  const payment = getPaymentDisplay(i);
  const vat = Number(i.tax_rate) > 0 || i.presentation?.vat_regime === 'applicable';
  return <SectionCard title={t('title')} rightSlot={<InvoicePaymentBadge invoice={i} />} wrap>
    <dl className="divide-y divide-border">
      <DetailRow label={t('subtotal')}>{m(i.subtotal_ht)}</DetailRow>
      {Number(i.discount_amount) > 0 && <DetailRow label={t('discount')}>− {m(i.discount_amount)}</DetailRow>}
      {Number(i.shipping_amount) > 0 && <DetailRow label={t('shipping')}>{m(i.shipping_amount)}</DetailRow>}
      <DetailRow label={vat ? t('tax_rate', { rate: Number(i.tax_rate) }) : t('tax')}>{vat ? m(i.tax_amount) : t('not_applicable')}</DetailRow>
      <DetailRow label={t('total')} className="text-base">{m(i.total_ttc)}</DetailRow>
      <DetailRow label={t('paid')} className="text-green-700 dark:text-green-400">{m(payment.amountPaid)}</DetailRow>
      <DetailRow label={t('remaining')} className={payment.remaining > 0 ? 'text-amber-700 dark:text-amber-400' : undefined}>{m(payment.remaining)}</DetailRow>
      <DetailRow label={t('due_date')}>{i.due_date ? date(i.due_date, { dateStyle: 'long', timeZone: 'UTC' }) : '—'}</DetailRow>
    </dl>
  </SectionCard>;
}
