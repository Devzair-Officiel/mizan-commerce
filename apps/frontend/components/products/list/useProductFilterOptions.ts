'use client';

import { useTranslations } from 'next-intl';
import type { CatalogKind } from '@/lib/hooks/useMe';
import type { ProductsFacets } from '@/lib/hooks/useProducts';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { parseOrdering } from '@/components/list/dataTableTypes';
import {
  STATES, STOCK_LEVELS, TYPES, type ProductState, type StockLevel, type TypeFilter,
} from './useProductsPageState';

/** Pastilles des filtres : mêmes couleurs que le tableau (rupture rouge, stock faible ambre). */
const STATE_DOT: Record<ProductState, string | undefined> = {
  all: undefined,
  active: 'bg-green-500',
  inactive: 'bg-muted-foreground/50',
};
const STOCK_DOT: Record<StockLevel, string | undefined> = {
  all: undefined,
  out: 'bg-red-500',
  low: 'bg-amber-500',
  in: 'bg-green-500',
};

/** Tris de la fenêtre mobile ; le tri par stock n'existe pas pour une boutique de services. */
const MOBILE_SORTS = [
  { value: 'name', key: 'sort_name' },
  { value: '-created_at', key: 'sort_newest' },
  { value: 'min_price', key: 'sort_price_asc' },
  { value: '-min_price', key: 'sort_price_desc' },
  { value: 'total_stock', key: 'sort_stock' },
] as const;

const SORT_FIELDS = ['name', 'created_at', 'min_price', 'total_stock', 'type'] as const;
type SortField = (typeof SORT_FIELDS)[number];

/**
 * Déclaration unique des filtres État, Type, Stock et des tris d'Articles, pour
 * le menu desktop comme pour la fenêtre mobile ; nombres fournis par `facets`.
 */
export function useProductFilterOptions(kind: CatalogKind, facets?: ProductsFacets) {
  const t = useTranslations('articles.list');
  const tSheet = useTranslations('articles.filterSheet');

  const stateOptions: FilterOption<ProductState>[] = STATES.map((value) => ({
    value, label: t(`state.${value}`), dotClassName: STATE_DOT[value], count: facets?.state[value],
  }));
  const typeOptions: FilterOption<TypeFilter>[] = TYPES.map((value) => ({
    value, label: t(`type.${value}`), count: facets?.type[value],
  }));
  const stockOptions: FilterOption<StockLevel>[] = STOCK_LEVELS.map((value) => ({
    value, label: t(`stock.${value}`), dotClassName: STOCK_DOT[value], count: facets?.stock[value],
  }));
  const sortOptions: FilterOption<string>[] = MOBILE_SORTS
    .filter(({ value }) => kind !== 'services' || value !== 'total_stock')
    .map(({ value, key }) => ({ value, label: tSheet(key) }));
  const sortLabel = (ordering: string): string => {
    const sort = parseOrdering(ordering);
    const field: SortField = SORT_FIELDS.includes(sort.field as SortField) ? (sort.field as SortField) : 'name';
    return t(`sort.${field}`, { dir: sort.direction });
  };

  return { stateOptions, typeOptions, stockOptions, sortOptions, sortLabel };
}
