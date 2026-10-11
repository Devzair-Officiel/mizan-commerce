'use client';

import { useTranslations } from 'next-intl';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { parseOrdering } from '@/components/list/dataTableTypes';
import { MOVEMENT_BADGE } from './MovementTypeBadge';
import { DEFAULT_MOVEMENTS_ORDERING, PERIOD_FILTERS, TYPE_FILTERS, type PeriodFilter, type TypeFilter } from './useStockMovementsState';

/** Filtres Mouvement et Période et tris par date, pour le menu desktop et la fenêtre mobile. */
export function useStockMovementFilterOptions() {
  const t = useTranslations('stock.movements');

  const typeOptions: FilterOption<TypeFilter>[] = TYPE_FILTERS.map((value) => ({
    value, label: t(`filter_type.${value}`),
    badgeClassName: value === 'all' ? undefined : MOVEMENT_BADGE[value],
  }));
  const periodOptions: FilterOption<PeriodFilter>[] = PERIOD_FILTERS.map((value) => ({
    value, label: t(`period.${value}`),
  }));
  const sortOptions: FilterOption<string>[] = [
    { value: DEFAULT_MOVEMENTS_ORDERING, label: t('sort_option.newest') },
    { value: 'created_at', label: t('sort_option.oldest') },
  ];
  const sortLabel = (ordering: string): string => t('sort', { dir: parseOrdering(ordering).direction });

  return { typeOptions, periodOptions, sortOptions, sortLabel };
}
