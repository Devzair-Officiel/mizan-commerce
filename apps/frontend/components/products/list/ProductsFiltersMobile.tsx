'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListMobileToolbar, type ActiveFilter } from '@/components/list/ListMobileToolbar';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { ProductsFilterSheet } from './ProductsFilterSheet';
import { useProductFilterOptions } from './useProductFilterOptions';
import type { ProductsPageState, ProductsSelection } from './useProductsPageState';

function activeFilter<T extends string>(
  name: string, value: T, options: FilterOption<T>[], onRemove: () => void,
): ActiveFilter | null {
  const option = options.find((o) => o.value === value);
  return value !== 'all' && option ? { name, option, onRemove } : null;
}

/** Barre d'outils mobile d'Articles et sa fenêtre Filtres (validation explicite). */
export function ProductsFiltersMobile({ state }: { state: ProductsPageState }) {
  const t = useTranslations('articles.list');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProductsSelection>(state.selection);
  const { stateOptions, typeOptions, stockOptions, sortLabel } = useProductFilterOptions(state.kind);

  const activeFilters = [
    activeFilter(t('type_title'), state.type, typeOptions, () => state.handleType('all')),
    activeFilter(t('stock_title'), state.stock, stockOptions, () => state.handleStock('all')),
    activeFilter(t('state_title'), state.state, stateOptions, () => state.handleState('all')),
  ].filter((f): f is ActiveFilter => !!f);

  const openSheet = () => {
    setDraft(state.selection);
    setOpen(true);
  };
  const apply = () => {
    state.applySelection(draft);
    setOpen(false);
  };

  return (
    <>
      <ListMobileToolbar
        searchValue={state.searchInput}
        onSearchChange={state.setSearchInput}
        searchLabel={t('search_label', { kind: state.kind })}
        searchPlaceholder={t('search_placeholder', { kind: state.kind })}
        activeFilters={activeFilters}
        onOpenFilters={openSheet}
        sortLabel={sortLabel(state.ordering)}
      />
      <ProductsFilterSheet open={open} kind={state.kind} draft={draft} onDraftChange={setDraft}
        search={state.search} onClose={() => setOpen(false)} onApply={apply} />
    </>
  );
}
