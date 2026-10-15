'use client';
import { useTranslations } from 'next-intl';
import type { InvoiceStatus } from '@/lib/hooks/useInvoices';
import { STATUS_DOT, STATUS_BADGE } from './status';

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const t = useTranslations('invoices');
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STATUS_BADGE[status]}`}>
    <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
    {t('status', { value: status })}
  </span>;
}
