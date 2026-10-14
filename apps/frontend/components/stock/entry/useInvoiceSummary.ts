'use client';

import { useTranslations } from 'next-intl';
import type { OcrResult } from '@/lib/hooks/useOcr';
import { useFormat } from '@/lib/hooks/useFormat';
import { isolateNumber } from '@/components/orders/OrderNumber';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « Lin & Co, facture F-2026-118 du 8 oct. 2026, 3 lignes lues » ; `null` avant la lecture. */
export function useInvoiceSummary(result: OcrResult | undefined): string | null {
  const t = useTranslations('stock.invoice');
  const f = useFormat();
  const invoice = result?.invoice;
  if (!result) return null;
  const parts: string[] = [];
  if (invoice?.supplier_name) parts.push(invoice.supplier_name);
  if (invoice?.invoice_number) {
    const date = invoice.invoice_date;
    parts.push(date
      ? t('read_number_date', { number: isolateNumber(invoice.invoice_number), date: ISO_DATE.test(date) ? f.date(date, { day: 'numeric', month: 'short', year: 'numeric' }) : date })
      : t('read_number', { number: isolateNumber(invoice.invoice_number) }));
  }
  parts.push(t('lines_read', { count: invoice?.lines.length ?? 0 }));
  return parts.join(', ');
}
