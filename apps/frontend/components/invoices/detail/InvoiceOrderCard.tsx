'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { DetailRow } from '@/components/detail/DetailRow';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { useFormatDate } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';

export function InvoiceOrderCard({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('invoices.detail');
  const date = useFormatDate();
  const p = invoice.presentation;
  if (!invoice.order) return null;
  return <SectionCard title={t('order_title')} rightLink={{ href: `/orders/${invoice.order}`, label: t('open_order') }}>
    <dl className="divide-y divide-border">
      {p?.order_number && <DetailRow label={t('order_number')}><OrderNumber>{p.order_number}</OrderNumber></DetailRow>}
      {p?.order_date && <DetailRow label={t('order_date')}>{date(p.order_date, { dateStyle: 'medium', timeZone: 'UTC' })}</DetailRow>}
    </dl>
    {!p?.order_number && <p className="px-5 py-4 text-sm text-muted-foreground">{t('linked_order')}</p>}
  </SectionCard>;
}
