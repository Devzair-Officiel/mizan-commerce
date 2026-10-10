'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { OrdersListFilters } from '@/lib/query-keys';
import { STATUSES, type StatusFilterKey } from './constants';

export type PaymentFilter = 'all' | 'due' | 'paid';
export type OrdersStatCardKey = 'to_prepare' | 'due' | 'month';

export const DEFAULT_ORDERING = '-created_at';

function asStatus(value: string): StatusFilterKey {
  return STATUSES.some((s) => s.value === value) ? (value as StatusFilterKey) : '';
}

export function useOrdersPageState() {
  const list = useListUrlState(DEFAULT_ORDERING);
  const statusFilter = asStatus(list.param('status'));
  const isDue = list.param('due') === 'true';
  const isPaid = list.param('payment_status') === 'paid';
  const isMonth = list.param('period') === 'month';
  const paymentFilter: PaymentFilter = isDue ? 'due' : isPaid ? 'paid' : 'all';

  const handleStatusFilter = (v: StatusFilterKey) => list.setParams({ status: v || null });
  const handlePaymentFilter = (v: PaymentFilter) => list.setParams({
    due: v === 'due' ? 'true' : null,
    payment_status: v === 'paid' ? 'paid' : null,
  });
  const handlePeriod = (month: boolean) => list.setParams({ period: month ? 'month' : null });
  /** Retire statut, paiement et période en une seule navigation ; garde recherche et tri. */
  const resetFilters = () => list.setParams({ status: null, due: null, payment_status: null, period: null });

  // Les indicateurs basculent leur filtre : un second clic le retire.
  const activeCards: Record<OrdersStatCardKey, boolean> = {
    to_prepare: statusFilter === 'to_prepare', due: isDue, month: isMonth,
  };
  const toggleCard = (card: OrdersStatCardKey) => {
    if (card === 'to_prepare') handleStatusFilter(activeCards.to_prepare ? '' : 'to_prepare');
    if (card === 'due') handlePaymentFilter(isDue ? 'all' : 'due');
    if (card === 'month') handlePeriod(!isMonth);
  };

  const filters: Omit<OrdersListFilters, 'page'> = {
    status: statusFilter || undefined,
    due: isDue || undefined,
    payment_status: isPaid ? 'paid' : undefined,
    period: isMonth ? 'month' : undefined,
    search: list.search || undefined,
    ordering: list.ordering === DEFAULT_ORDERING ? undefined : list.ordering,
  };
  const isFiltered = !!statusFilter || isDue || isPaid || isMonth || !!list.search;

  return {
    statusFilter, paymentFilter, isMonth, isFiltered, filters, activeCards,
    page: list.page, ordering: list.ordering,
    searchInput: list.searchInput, setSearchInput: list.setSearch,
    setPage: list.setPage, setOrdering: list.setOrdering, clearFilters: list.clearFilters,
    handleStatusFilter, handlePaymentFilter, handlePeriod, resetFilters, toggleCard,
  };
}

export type OrdersPageState = ReturnType<typeof useOrdersPageState>;
