'use client';

import { useTranslations } from 'next-intl';
import { FilterChip } from '@/components/list/FilterChip';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import { ListToolbar } from '@/components/list/ListToolbar';
import { useMovementProductName } from './useMovementProductName';
import { useStockMovementFilterOptions } from './useStockMovementFilterOptions';
import type { StockMovementsPageState } from './useStockMovementsState';

/** Barre d'outils desktop de l'onglet Mouvements : recherche, article, Mouvement, Période, tri. */
export function StockMovementsToolbar({ state }: { state: StockMovementsPageState }) {
  const t = useTranslations('stock.movements');
  const { typeOptions, periodOptions, sortLabel } = useStockMovementFilterOptions();
  const productName = useMovementProductName(state.product);

  return (
    <ListToolbar
      searchValue={state.searchInput}
      onSearchChange={state.setSearchInput}
      searchLabel={t('search_label')}
      searchPlaceholder={t('search_placeholder')}
      filters={
        <>
          {state.product && <FilterChip name={t('product_filter')} value={productName} onRemove={state.clearProduct} />}
          <FilterMenuButton label={t('type_title')} value={state.type} allValue="all"
            options={typeOptions} onChange={state.handleType} />
          <FilterMenuButton label={t('period_title')} value={state.period} allValue="all"
            options={periodOptions} onChange={state.handlePeriod} />
        </>
      }
      clearLabel={t('clear_filters')}
      onClear={state.isFiltered ? state.clearFilters : undefined}
      sortLabel={sortLabel(state.ordering)}
    />
  );
}
