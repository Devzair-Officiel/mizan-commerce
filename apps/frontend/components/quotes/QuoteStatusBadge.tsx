'use client';

import { useTranslations } from 'next-intl';
import type { QuoteStatus } from '@/lib/hooks/useQuotes';
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_DOT } from './status';

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const t = useTranslations('quotes');
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${QUOTE_STATUS_BADGE[status]}`}>
    <span className={`size-2 shrink-0 rounded-full ${QUOTE_STATUS_DOT[status]}`} />
    {t('status', { value: status })}
  </span>;
}
