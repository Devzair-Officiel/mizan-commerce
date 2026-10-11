'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { StockMovementGroup } from '@/lib/hooks/useStock';
import type { StockMovementsFilters } from '@/lib/query-keys';

export type TypeFilter = 'all' | StockMovementGroup;
export type PeriodFilter = 'all' | NonNullable<StockMovementsFilters['period']>;

export const TYPE_FILTERS: readonly TypeFilter[] = ['all', 'in', 'out', 'reservation', 'release', 'adjustment'];
export const PERIOD_FILTERS: readonly PeriodFilter[] = ['all', 'today', '7d', '30d', '90d'];
export const DEFAULT_MOVEMENTS_ORDERING = '-created_at';

/** Filtres et tri d'une sélection : appliquée (URL) ou en brouillon (fenêtre mobile). */
export interface StockMovementsSelection {
  type: TypeFilter;
  period: PeriodFilter;
  ordering: string;
}

function oneOf<T extends string>(values: readonly T[], value: string): T | 'all' {
  return values.find((v) => v === value) ?? 'all';
}

/**
 * État de l'onglet Mouvements porté par l'URL : famille, période, article
 * (lien « Voir tout » d'une fiche), recherche, tri par date, page.
 */
export function useStockMovementsState() {
  const list = useListUrlState(DEFAULT_MOVEMENTS_ORDERING);
  const type = oneOf(TYPE_FILTERS, list.param('type'));
  const period = oneOf(PERIOD_FILTERS, list.param('period'));
  const product = list.param('product');
  const all = (value: string) => (value === 'all' ? null : value);
  const selection: StockMovementsSelection = { type, period, ordering: list.ordering };

  const filters: Omit<StockMovementsFilters, 'page'> = {
    type: type === 'all' ? undefined : type,
    period: period === 'all' ? undefined : period,
    product: product || undefined,
    search: list.search || undefined,
    ordering: list.ordering,
  };

  return {
    type, period, product, selection, filters,
    isFiltered: type !== 'all' || period !== 'all' || !!product || !!list.search,
    page: list.page, ordering: list.ordering,
    searchInput: list.searchInput, setSearchInput: list.setSearch,
    setPage: list.setPage, setOrdering: list.setOrdering, clearFilters: list.clearFilters,
    handleType: (v: TypeFilter) => list.setParams({ type: all(v) }),
    handlePeriod: (v: PeriodFilter) => list.setParams({ period: all(v) }),
    clearProduct: () => list.setParams({ product: null }),
    applySelection: (s: StockMovementsSelection) => list.setParams({
      type: all(s.type), period: all(s.period),
      ordering: s.ordering === DEFAULT_MOVEMENTS_ORDERING ? null : s.ordering,
    }),
  };
}

export type StockMovementsPageState = ReturnType<typeof useStockMovementsState>;
