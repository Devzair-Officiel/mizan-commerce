'use client';

import { useListUrlState } from '@/lib/hooks/useListUrlState';
import type { CatalogKind } from '@/lib/hooks/useMe';
import type { ProductsPageFilters } from '@/lib/query-keys';

export type ProductState = 'all' | 'active' | 'inactive';
export type TypeFilter = 'all' | 'product' | 'service';
export type StockLevel = 'all' | 'negative' | 'out' | 'low' | 'in';
export type ProductsStatCardKey = 'out' | 'low' | 'active';

export const STATES: readonly ProductState[] = ['all', 'active', 'inactive'];
export const TYPES: readonly TypeFilter[] = ['all', 'product', 'service'];
export const STOCK_LEVELS: readonly StockLevel[] = ['all', 'negative', 'out', 'low', 'in'];
export const DEFAULT_ORDERING = 'name';

/** Filtres et tri d'une sélection : appliquée (URL) ou en brouillon (fenêtre mobile). */
export interface ProductsSelection {
  state: ProductState;
  type: TypeFilter;
  stock: StockLevel;
  ordering: string;
}

export const EMPTY_FILTERS = { state: 'all', type: 'all', stock: 'all' } as const;

/** Paramètres de liste d'une sélection, partagés par la liste et les facettes. */
export function selectionFilters(s: ProductsSelection, search: string): Omit<ProductsPageFilters, 'page'> {
  return {
    // État et tri toujours explicites : sans valeur, l'API ne renvoie que les actifs,
    // triés par date d'ajout.
    state: s.state,
    type: s.type === 'all' ? undefined : s.type,
    stock: s.stock === 'all' ? undefined : s.stock,
    search: search || undefined,
    ordering: s.ordering,
  };
}

/** Valeur de l'URL si elle est connue, sinon « Tous ». */
function oneOf<T extends string>(values: readonly T[], value: string): T | 'all' {
  return values.find((v) => v === value) ?? 'all';
}

/**
 * État de la page Articles porté par l'URL. Le filtre Type n'existe que dans
 * une boutique mixte, le filtre Stock pas dans une boutique de services : un
 * paramètre resté dans l'URL est alors ignoré.
 */
export function useProductsPageState(kind: CatalogKind) {
  const list = useListUrlState(DEFAULT_ORDERING);
  const state = oneOf(STATES, list.param('state'));
  const type = kind === 'both' ? oneOf(TYPES, list.param('type')) : 'all';
  const stock = kind === 'services' ? 'all' : oneOf(STOCK_LEVELS, list.param('stock'));

  const all = (value: string) => (value === 'all' ? null : value);
  const handleState = (v: ProductState) => list.setParams({ state: all(v) });
  const handleType = (v: TypeFilter) => list.setParams({ type: all(v) });
  const handleStock = (v: StockLevel) => list.setParams({ stock: all(v) });
  const selection: ProductsSelection = { state, type, stock, ordering: list.ordering };
  /** Applique filtres et tri en une seule navigation (validation de la fenêtre mobile). */
  const applySelection = (s: ProductsSelection) => list.setParams({
    state: all(s.state), type: all(s.type), stock: all(s.stock),
    ordering: s.ordering === DEFAULT_ORDERING ? null : s.ordering,
  });

  // Les indicateurs basculent leur filtre : un second clic le retire. Rupture et stock faible
  // comptent les articles actifs : leur filtre fixe aussi l'état, la liste montre ce nombre.
  const activeCards: Record<ProductsStatCardKey, boolean> = {
    out: stock === 'out' && state === 'active', low: stock === 'low' && state === 'active', active: state === 'active',
  };
  const toggleCard = (card: ProductsStatCardKey) => {
    if (card === 'active') handleState(activeCards.active ? 'all' : 'active');
    else if (activeCards[card]) handleStock('all');
    else list.setParams({ stock: card, state: 'active' });
  };

  const filters = selectionFilters(selection, list.search);
  const isFiltered = state !== 'all' || type !== 'all' || stock !== 'all' || !!list.search;

  return {
    kind, state, type, stock, isFiltered, filters, activeCards, selection,
    page: list.page, ordering: list.ordering, search: list.search,
    searchInput: list.searchInput, setSearchInput: list.setSearch,
    setPage: list.setPage, setOrdering: list.setOrdering, clearFilters: list.clearFilters,
    handleState, handleType, handleStock, applySelection, toggleCard,
  };
}

export type ProductsPageState = ReturnType<typeof useProductsPageState>;
