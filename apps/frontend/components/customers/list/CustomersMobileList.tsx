'use client';

import { useTranslations } from 'next-intl';
import type { CustomerSummary } from '@/lib/hooks/useCustomers';
import { CustomerRow } from './CustomerRow';

interface Props {
  customers: CustomerSummary[];
  currency: string;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isLoading: boolean;
}

export function CustomersMobileList({
  customers, currency, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading,
}: Props) {
  const t = useTranslations('customers.list');

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }
  if (customers.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {customers.map((customer, i) => (
          <CustomerRow key={customer.id} customer={customer} first={i === 0} currency={currency} />
        ))}
      </div>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mx-auto flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isFetchingNextPage ? '…' : t('load_more')}
        </button>
      )}
    </div>
  );
}
