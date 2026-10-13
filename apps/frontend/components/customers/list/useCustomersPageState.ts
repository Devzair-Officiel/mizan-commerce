'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { CustomersListFilters } from '@/lib/query-keys';

export type Situation = 'all' | 'active' | 'pending' | 'deactivated';
export type CustomersStatCardKey = 'active' | 'due' | 'new';

export const SITUATIONS: readonly Situation[] = ['all', 'active', 'pending', 'deactivated'];
export const DEFAULT_ORDERING = 'name';

/** Filtres et tri d'une sélection : appliquée (URL) ou en brouillon (fenêtre mobile). */
export interface CustomersSelection {
  situation: Situation;
  month: boolean;
  ordering: string;
}

export const EMPTY_FILTERS = { situation: 'all', month: false } as const;

/** Paramètres de liste d'une sélection, partagés par la liste et les facettes. */
export function selectionFilters(s: CustomersSelection, search: string): Omit<CustomersListFilters, 'page'> {
  return {
    // Toujours explicite : sans valeur, l'API ne renvoie que les clients actifs.
    situation: s.situation,
    period: s.month ? 'month' : undefined,
    search: search || undefined,
    ordering: s.ordering === DEFAULT_ORDERING ? undefined : s.ordering,
  };
}

function asSituation(value: string): Situation {
  return SITUATIONS.includes(value as Situation) ? (value as Situation) : 'all';
}

export function useCustomersPageState() {
  const list = useListUrlState(DEFAULT_ORDERING);
  const situation = asSituation(list.param('situation'));
  const isMonth = list.param('period') === 'month';

  const handleSituation = (v: Situation) => list.setParams({ situation: v === 'all' ? null : v });
  const handlePeriod = (month: boolean) => list.setParams({ period: month ? 'month' : null });
  const selection: CustomersSelection = { situation, month: isMonth, ordering: list.ordering };
  /** Applique filtres et tri en une seule navigation (validation de la fenêtre mobile). */
  const applySelection = (s: CustomersSelection) => list.setParams({
    situation: s.situation === 'all' ? null : s.situation,
    period: s.month ? 'month' : null,
    ordering: s.ordering === DEFAULT_ORDERING ? null : s.ordering,
  });

  // Les indicateurs basculent leur filtre : un second clic le retire.
  const activeCards: Record<CustomersStatCardKey, boolean> = {
    active: situation === 'active', due: situation === 'pending', new: isMonth,
  };
  const toggleCard = (card: CustomersStatCardKey) => {
    if (card === 'active') handleSituation(activeCards.active ? 'all' : 'active');
    if (card === 'due') handleSituation(activeCards.due ? 'all' : 'pending');
    if (card === 'new') handlePeriod(!isMonth);
  };

  const filters = selectionFilters(selection, list.search);
  const isFiltered = situation !== 'all' || isMonth || !!list.search;

  return {
    situation, isMonth, isFiltered, filters, activeCards, selection,
    page: list.page, ordering: list.ordering, search: list.search,
    searchInput: list.searchInput, setSearchInput: list.setSearch,
    setPage: list.setPage, setOrdering: list.setOrdering, clearFilters: list.clearFilters,
    handleSituation, handlePeriod, applySelection, toggleCard,
  };
}

export type CustomersPageState = ReturnType<typeof useCustomersPageState>;
