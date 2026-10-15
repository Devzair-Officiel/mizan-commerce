'use client';

import { useTranslations } from 'next-intl';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { useFormatShopDate } from '@/lib/hooks/useFormat';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { InvoiceRow } from './InvoiceRow';

export function InvoicesMobileList({ invoices, ordering, loading, hasNextPage, fetching, loadMore }: {
  invoices: Invoice[]; ordering: string; loading: boolean; hasNextPage: boolean; fetching: boolean; loadMore: () => void;
}) {
  const t = useTranslations('invoices.list');
  const date = useFormatShopDate();
  if (loading) return <SkeletonRows count={4} variant="cards" />;
  if (!invoices.length) return null;
  const byDate = ordering === '-issued_at' || ordering === 'issued_at';
  const groups = new Map<string, Invoice[]>();
  for (const i of invoices) {
    const key = byDate ? date(i.issued_at, { dateStyle: 'long' }) : '';
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return <div className="flex flex-col gap-5">
    {[...groups].map(([label, rows]) => <section key={label} className="flex flex-col gap-2">
      {label && <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map(i => <InvoiceRow key={i.id} invoice={i} />)}
      </div>
    </section>)}
    {hasNextPage && <button type="button" onClick={loadMore} disabled={fetching}
      className="mx-auto h-11 rounded-full border border-border bg-card px-6 text-sm font-medium whitespace-nowrap disabled:opacity-50">
      {fetching ? '…' : t('load_more')}
    </button>}
  </div>;
}
