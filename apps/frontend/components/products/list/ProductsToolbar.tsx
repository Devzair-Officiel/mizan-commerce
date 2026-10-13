'use client';

import { useTranslations } from 'next-intl';
import { ListToolbar } from '@/components/list/ListToolbar';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import { useProductsFacets } from '@/lib/hooks/useProducts';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useProductFilterOptions } from './useProductFilterOptions';
import type { ProductsPageState } from './useProductsPageState';

/** Barre d'outils desktop d'Articles : recherche, Type (boutique mixte), Stock, État, tri courant. */
export function ProductsToolbar({ state }: { state: ProductsPageState }) {
  const t = useTranslations('articles.list');
  const isDesktop = useIsDesktop();
  const { data: facets } = useProductsFacets(state.filters, { enabled: isDesktop === true });
  const { stateOptions, typeOptions, stockOptions, sortLabel } = useProductFilterOptions(state.kind, facets);

  return (
    <ListToolbar
      searchValue={state.searchInput}
      onSearchChange={state.setSearchInput}
      searchLabel={t('search_label', { kind: state.kind })}
      searchPlaceholder={t('search_placeholder', { kind: state.kind })}
      filters={
        <>
          {state.kind === 'both' && (
            <FilterMenuButton label={t('type_title')} value={state.type} allValue="all"
              options={typeOptions} onChange={state.handleType} />
          )}
          {state.kind !== 'services' && (
            <FilterMenuButton label={t('stock_title')} value={state.stock} allValue="all"
              options={stockOptions} onChange={state.handleStock} />
          )}
          <FilterMenuButton label={t('state_title')} value={state.state} allValue="all"
            options={stateOptions} onChange={state.handleState} />
        </>
      }
      clearLabel={t('clear_filters')}
      onClear={state.isFiltered ? state.clearFilters : undefined}
      sortLabel={sortLabel(state.ordering)}
    />
  );
}
