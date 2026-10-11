'use client';

import { useTranslations } from 'next-intl';
import { ListToolbar } from '@/components/list/ListToolbar';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import { useStockLevelsFacets } from '@/lib/hooks/useStock';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useStockLevelFilterOptions } from './useStockLevelFilterOptions';
import type { StockLevelsPageState } from './useStockLevelsState';

/** Barre d'outils desktop de l'onglet Niveaux : recherche, État, tri courant. */
export function StockLevelsToolbar({ state }: { state: StockLevelsPageState }) {
  const t = useTranslations('stock.levels');
  const isDesktop = useIsDesktop();
  const { data: facets } = useStockLevelsFacets({ search: state.filters.search }, { enabled: isDesktop === true });
  const { stateOptions, sortLabel } = useStockLevelFilterOptions(facets);

  return (
    <ListToolbar
      searchValue={state.searchInput}
      onSearchChange={state.setSearchInput}
      searchLabel={t('search_label')}
      searchPlaceholder={t('search_placeholder')}
      filters={
        <FilterMenuButton label={t('state_title')} value={state.state} allValue="all"
          options={stateOptions} onChange={state.handleState} />
      }
      clearLabel={t('clear_filters')}
      onClear={state.isFiltered ? state.clearFilters : undefined}
      sortLabel={sortLabel(state.ordering)}
    />
  );
}
