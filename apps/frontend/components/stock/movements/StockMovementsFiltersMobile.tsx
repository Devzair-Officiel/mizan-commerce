'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FilterSheetSection } from '@/components/list/FilterSheetSection';
import { ListFilterSheet } from '@/components/list/ListFilterSheet';
import { ListMobileToolbar, type ActiveFilter } from '@/components/list/ListMobileToolbar';
import { useMovementProductName } from './useMovementProductName';
import { useStockMovementFilterOptions } from './useStockMovementFilterOptions';
import type { StockMovementsPageState, StockMovementsSelection } from './useStockMovementsState';

/** Barre d'outils mobile de l'onglet Mouvements et sa fenêtre Filtres (validation explicite). */
export function StockMovementsFiltersMobile({ state }: { state: StockMovementsPageState }) {
  const t = useTranslations('stock.movements');
  const tSheet = useTranslations('stock.filterSheet');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StockMovementsSelection>(state.selection);
  const { typeOptions, periodOptions, sortOptions, sortLabel } = useStockMovementFilterOptions();
  const productName = useMovementProductName(state.product);

  const type = typeOptions.find((o) => o.value === state.type);
  const period = periodOptions.find((o) => o.value === state.period);
  const activeFilters: ActiveFilter[] = [
    ...(state.product ? [{ name: t('product_filter'), option: { value: state.product, label: productName }, onRemove: state.clearProduct }] : []),
    ...(state.type !== 'all' && type ? [{ name: t('type_title'), option: type, onRemove: () => state.handleType('all') }] : []),
    ...(state.period !== 'all' && period ? [{ name: t('period_title'), option: period, onRemove: () => state.handlePeriod('all') }] : []),
  ];

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
        onReset={() => setDraft({ ...draft, type: 'all', period: 'all' })}
        resetDisabled={draft.type === 'all' && draft.period === 'all'}
        applyLabel={tSheet('apply_movements')}
        onApply={() => { state.applySelection(draft); setOpen(false); }}
      >
        <FilterSheetSection title={t('type_title')} value={draft.type} options={typeOptions}
          onChange={(value) => setDraft({ ...draft, type: value })} />
        <FilterSheetSection title={t('period_title')} value={draft.period} options={periodOptions}
          onChange={(value) => setDraft({ ...draft, period: value })} />
        <FilterSheetSection title={tSheet('sort_title')} value={draft.ordering} options={sortOptions}
          onChange={(ordering) => setDraft({ ...draft, ordering })} />
      </ListFilterSheet>
    </>
  );
}
