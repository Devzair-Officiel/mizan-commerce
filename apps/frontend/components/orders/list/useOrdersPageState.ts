'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { OrdersListFilters } from '@/lib/query-keys';
import { STATUSES, type StatusFilterKey } from './constants';

export type PaymentFilter = 'all' | 'due' | 'paid';
export type OrdersStatCardKey = 'to_prepare' | 'due' | 'month';

export const DEFAULT_ORDERING = '-created_at';

/** Filtres et tri d'une sélection : appliquée (URL) ou en brouillon (fenêtre mobile). */
export interface OrdersSelection {
  status: StatusFilterKey;
  payment: PaymentFilter;
  month: boolean;
  ordering: string;
}

export const EMPTY_FILTERS = { status: '', payment: 'all', month: false } as const;

/** Paramètres de liste d'une sélection, partagés par la liste et les facettes. */
export function selectionFilters(s: OrdersSelection, search: string): Omit<OrdersListFilters, 'page'> {
  return {
    status: s.status || undefined,
    due: s.payment === 'due' || undefined,
    payment_status: s.payment === 'paid' ? 'paid' : undefined,
    period: s.month ? 'month' : undefined,
    search: search || undefined,
    ordering: s.ordering === DEFAULT_ORDERING ? undefined : s.ordering,
  };
}

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
  const selection: OrdersSelection = { status: statusFilter, payment: paymentFilter, month: isMonth, ordering: list.ordering };
  /** Applique filtres et tri en une seule navigation (validation de la fenêtre mobile). */
  const applySelection = (s: OrdersSelection) => list.setParams({
    status: s.status || null,
    due: s.payment === 'due' ? 'true' : null,
    payment_status: s.payment === 'paid' ? 'paid' : null,
    period: s.month ? 'month' : null,
    ordering: s.ordering === DEFAULT_ORDERING ? null : s.ordering,
  });

  // Les indicateurs basculent leur filtre : un second clic le retire.
  const activeCards: Record<OrdersStatCardKey, boolean> = {
    to_prepare: statusFilter === 'to_prepare', due: isDue, month: isMonth,
  };
  const toggleCard = (card: OrdersStatCardKey) => {
    if (card === 'to_prepare') handleStatusFilter(activeCards.to_prepare ? '' : 'to_prepare');
    if (card === 'due') handlePaymentFilter(isDue ? 'all' : 'due');
    if (card === 'month') handlePeriod(!isMonth);
  };

  const filters = selectionFilters(selection, list.search);
  const isFiltered = !!statusFilter || isDue || isPaid || isMonth || !!list.search;

  return {
    statusFilter, paymentFilter, isMonth, isFiltered, filters, activeCards, selection,
    page: list.page, ordering: list.ordering, search: list.search,
    searchInput: list.searchInput, setSearchInput: list.setSearch,
    setPage: list.setPage, setOrdering: list.setOrdering, clearFilters: list.clearFilters,
    handleStatusFilter, handlePaymentFilter, handlePeriod, applySelection, toggleCard,
  };
}

export type OrdersPageState = ReturnType<typeof useOrdersPageState>;
