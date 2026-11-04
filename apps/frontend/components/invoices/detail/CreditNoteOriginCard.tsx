'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { DetailRow } from '@/components/detail/DetailRow';
import { OrderNumber } from '@/components/orders/OrderNumber';
import { useFormatDate } from '@/lib/hooks/useFormat';
import type { Invoice } from '@/lib/hooks/useInvoices';

/** Avoir : facture d'origine (numéro et date figés à l'émission, lien) et motif. */
export function CreditNoteOriginCard({ invoice: i }: { invoice: Invoice }) {
  const t = useTranslations('invoices.detail');
  const date = useFormatDate();
  return <SectionCard title={t('credit_of')} rightLink={i.credited_invoice ? { href: `/invoices/${i.credited_invoice}`, label: t('open_order') } : undefined}>
    <dl className="divide-y divide-border">
      <DetailRow label={t('order_number')}><OrderNumber>{i.credited_number || '—'}</OrderNumber></DetailRow>
      {i.credited_issued_date && <DetailRow label={t('origin_date')}>{date(i.credited_issued_date, { dateStyle: 'long', timeZone: 'UTC' })}</DetailRow>}
      {i.credit_reason && <div className="px-4 py-3 lg:px-5">
        <dt className="text-sm text-muted-foreground">{t('reason')}</dt>
        <dd dir="auto" className="mt-1 text-sm whitespace-pre-wrap wrap-break-word">{i.credit_reason}</dd>
      </div>}
    </dl>
  </SectionCard>;
}
