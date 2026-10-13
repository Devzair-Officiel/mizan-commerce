'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { StockState } from '@/lib/hooks/useProducts';
import type { StockLevelsFilters } from '@/lib/query-keys';

export type StateFilter = 'all' | StockState;
export type StockStatCardKey = 'negative' | 'out' | 'low' | 'value';

export const STATE_FILTERS: readonly StateFilter[] = ['all', 'negative', 'out', 'low', 'in'];
export const DEFAULT_LEVELS_ORDERING = 'stock';
/** Tri appliqué par l'indicateur « Valeur du stock » : les formats qui pèsent le plus d'abord. */
export const VALUE_ORDERING = '-purchase_value';

/** Filtre et tri d'une sélection : appliquée (URL) ou en brouillon (fenêtre mobile). */
export interface StockLevelsSelection {
  state: StateFilter;
  ordering: string;
}

export function levelsFilters(s: StockLevelsSelection, search: string): Omit<StockLevelsFilters, 'page'> {
  return { state: s.state === 'all' ? undefined : s.state, search: search || undefined, ordering: s.ordering };
}

/** État de l'onglet Niveaux porté par l'URL (`state`, recherche, tri, page). */
export function useStockLevelsState() {
  const list = useListUrlState(DEFAULT_LEVELS_ORDERING);
  const state = STATE_FILTERS.find((v) => v === list.param('state')) ?? 'all';
  const handleState = (v: StateFilter) => list.setParams({ state: v === 'all' ? null : v });
  const selection: StockLevelsSelection = { state, ordering: list.ordering };
  const applySelection = (s: StockLevelsSelection) => list.setParams({
    state: s.state === 'all' ? null : s.state,
    ordering: s.ordering === DEFAULT_LEVELS_ORDERING ? null : s.ordering,
  });

  // Chaque indicateur bascule son filtre ; « Valeur du stock » bascule le tri par valeur.
  const activeCards: Record<StockStatCardKey, boolean> = {
    negative: state === 'negative', out: state === 'out', low: state === 'low',
    value: list.ordering === VALUE_ORDERING,
  };
  const toggleCard = (card: StockStatCardKey) => {
    if (card === 'value') list.setOrdering(activeCards.value ? DEFAULT_LEVELS_ORDERING : VALUE_ORDERING);
    else handleState(activeCards[card] ? 'all' : card);
  };

  return {
    state, selection, activeCards, isFiltered: state !== 'all' || !!list.search,
    filters: levelsFilters(selection, list.search),
    page: list.page, ordering: list.ordering, search: list.search,
    searchInput: list.searchInput, setSearchInput: list.setSearch,
    setPage: list.setPage, setOrdering: list.setOrdering, clearFilters: list.clearFilters,
    handleState, applySelection, toggleCard,
  };
}

export type StockLevelsPageState = ReturnType<typeof useStockLevelsState>;
