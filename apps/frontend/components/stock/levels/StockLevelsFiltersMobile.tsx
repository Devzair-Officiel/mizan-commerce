'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListMobileToolbar, type ActiveFilter } from '@/components/list/ListMobileToolbar';
import { ListFilterSheet } from '@/components/list/ListFilterSheet';
import { FilterSheetSection } from '@/components/list/FilterSheetSection';
import { useStockLevelsFacets } from '@/lib/hooks/useStock';
import { useStockLevelFilterOptions } from './useStockLevelFilterOptions';
import type { StockLevelsPageState, StockLevelsSelection } from './useStockLevelsState';

/** Barre d'outils mobile de l'onglet Niveaux et sa fenêtre Filtres (validation explicite). */
export function StockLevelsFiltersMobile({ state }: { state: StockLevelsPageState }) {
  const t = useTranslations('stock.levels');
  const tSheet = useTranslations('stock.filterSheet');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StockLevelsSelection>(state.selection);
  const { data: facets } = useStockLevelsFacets({ search: state.filters.search }, { enabled: open });
  const { stateOptions, sortOptions, sortLabel } = useStockLevelFilterOptions(facets);

  const current = stateOptions.find((o) => o.value === state.state);
  const activeFilters: ActiveFilter[] = state.state !== 'all' && current
    ? [{ name: t('state_title'), option: current, onRemove: () => state.handleState('all') }]
    : [];
  const count = facets?.state[draft.state];

  return (
    <>
      <ListMobileToolbar
        searchValue={state.searchInput}
        onSearchChange={state.setSearchInput}
        searchLabel={t('search_label')}
        searchPlaceholder={t('search_placeholder')}
        activeFilters={activeFilters}
        onOpenFilters={() => { setDraft(state.selection); setOpen(true); }}
        sortLabel={sortLabel(state.ordering)}
      />
      <ListFilterSheet
        open={open}
        onClose={() => setOpen(false)}
        onReset={() => setDraft({ ...draft, state: 'all' })}
        resetDisabled={draft.state === 'all'}
        applyLabel={count === undefined ? tSheet('apply_levels') : tSheet('show_levels', { count })}
        onApply={() => { state.applySelection(draft); setOpen(false); }}
      >
        <FilterSheetSection title={t('state_title')} value={draft.state} options={stateOptions}
          onChange={(value) => setDraft({ ...draft, state: value })} />
        <FilterSheetSection title={tSheet('sort_title')} value={draft.ordering} options={sortOptions}
          onChange={(ordering) => setDraft({ ...draft, ordering })} />
      </ListFilterSheet>
    </>
  );
}
