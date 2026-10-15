'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { DetailRow } from '@/components/detail/DetailRow';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';

export function InvoiceAccountCard({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('invoices.account');
  const money = useFormatMoney();
  const s = invoice.presentation?.account_summary;
  if (!invoice.presentation?.show_account_summary || !s) return null;
  return <SectionCard title={t('title')}>
    {!!s.previous_invoices.length && <p className="px-5 pt-4 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-1">
      {s.previous_invoices.map(i => <OrderNumber key={i.number}>{i.number}</OrderNumber>)}
    </p>}
    <dl className="divide-y divide-border">
      <DetailRow label={t('previous')}>{money(s.previous_balance, invoice.currency)}</DetailRow>
      <DetailRow label={t('payments')}>− {money(s.payments_received, invoice.currency)}</DetailRow>
      <DetailRow label={t('current')}>{money(s.current_invoice, invoice.currency)}</DetailRow>
      <DetailRow label={t('balance')} className="text-primary">{money(s.total_balance, invoice.currency)}</DetailRow>
    </dl>
  </SectionCard>;
}
