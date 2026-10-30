'use client';

import { useTranslations } from 'next-intl';
import type { Quote } from '@/lib/hooks/useQuotes';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { QuoteRow } from './QuoteRow';

export function QuotesMobileList({ quotes, loading, hasNextPage, fetching, loadMore }: {
  quotes: Quote[]; loading: boolean; hasNextPage: boolean; fetching: boolean; loadMore: () => void;
}) {
  const t = useTranslations('quotes');
  if (loading) return <SkeletonRows count={4} variant="cards" />;
  if (!quotes.length) return null;
  return <div className="flex flex-col gap-5">
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {quotes.map(q => <QuoteRow key={q.id} quote={q} />)}
    </div>
    {hasNextPage && <button type="button" onClick={loadMore} disabled={fetching}
      className="mx-auto h-11 rounded-full border border-border bg-card px-6 text-sm font-medium whitespace-nowrap disabled:opacity-50">
      {fetching ? '…' : t('load_more')}
    </button>}
  </div>;
}
