'use client';

import { useTranslations } from 'next-intl';
import type { StockLevelsFacets } from '@/lib/hooks/useStock';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { parseOrdering } from '@/components/list/dataTableTypes';
import { STATE_BADGE } from './StockStateBadge';
import { STATE_FILTERS, type StateFilter } from './useStockLevelsState';

const SORT_FIELDS = ['stock', 'name', 'purchase_value', 'last_movement'] as const;
type SortField = (typeof SORT_FIELDS)[number];

const MOBILE_SORTS = [
  { value: 'stock', key: 'stock_asc' },
  { value: 'name', key: 'name_asc' },
  { value: '-purchase_value', key: 'value_desc' },
  { value: '-last_movement', key: 'last_movement_desc' },
] as const;

/** Filtre État et tris de l'onglet Niveaux, pour le menu desktop et la fenêtre mobile. */
export function useStockLevelFilterOptions(facets?: StockLevelsFacets) {
  const t = useTranslations('stock.levels');

  const stateOptions: FilterOption<StateFilter>[] = STATE_FILTERS.map((value) => ({
    value, label: t(`state.${value}`), count: facets?.state[value],
    badgeClassName: value === 'all' ? undefined : STATE_BADGE[value],
  }));
  const sortOptions: FilterOption<string>[] = MOBILE_SORTS.map(({ value, key }) => ({
    value, label: t(`sort_option.${key}`),
  }));
  const sortLabel = (ordering: string): string => {
    const sort = parseOrdering(ordering);
    const field = SORT_FIELDS.includes(sort.field as SortField) ? (sort.field as SortField) : 'stock';
    return t(`sort.${field}`, { dir: sort.direction });
  };

  return { stateOptions, sortOptions, sortLabel };
}
