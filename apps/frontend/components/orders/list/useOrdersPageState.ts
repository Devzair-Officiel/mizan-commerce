'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import type { StatusFilterKey } from './constants';
import type { OrdersListFilters } from '@/lib/query-keys';

function useDebouncedValue<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setD(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return d;
}

export function useOrdersPageState() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const statusFilter = (searchParams.get('status') as StatusFilterKey) ?? '';
  const isDue = searchParams.get('due') === 'true';
  const isPaid = searchParams.get('payment_status') === 'paid';
  const urlSearch = searchParams.get('search') ?? '';
  const urlPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const paymentFilter: 'all' | 'due' | 'paid' = isDue ? 'due' : isPaid ? 'paid' : 'all';

  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const updateURL = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, pathname, router]);

  useEffect(() => {
    if (debouncedSearch === (searchParams.get('search') ?? '')) return;
    updateURL({ search: debouncedSearch || null, page: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleStatusFilter = (v: StatusFilterKey) => updateURL({ status: v || null, page: null });
  const handlePaymentFilter = (v: 'all' | 'due' | 'paid') => {
    updateURL({ due: v === 'due' ? 'true' : null, payment_status: v === 'paid' ? 'paid' : null, page: null });
  };
  const clearFilters = () => { setSearchInput(''); router.replace(pathname); };

  const filters: Omit<OrdersListFilters, 'page'> = {
    status: statusFilter || undefined,
    due: isDue || undefined,
    payment_status: isPaid ? ('paid' as const) : undefined,
    search: debouncedSearch || undefined,
  };
  const isFiltered = !!statusFilter || isDue || isPaid || !!debouncedSearch;

  return {
    statusFilter, isDue, isPaid, urlPage, paymentFilter,
    searchInput, setSearchInput, isFiltered, filters,
    updateURL, handleStatusFilter, handlePaymentFilter, clearFilters,
  };
}
