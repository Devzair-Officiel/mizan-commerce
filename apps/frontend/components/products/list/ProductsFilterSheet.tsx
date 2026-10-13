'use client';

import { useTranslations } from 'next-intl';
import { ListFilterSheet } from '@/components/list/ListFilterSheet';
import { FilterSheetSection } from '@/components/list/FilterSheetSection';
import type { CatalogKind } from '@/lib/hooks/useMe';
import { useProductsFacets } from '@/lib/hooks/useProducts';
import { useProductFilterOptions } from './useProductFilterOptions';
import { EMPTY_FILTERS, selectionFilters, type ProductsSelection } from './useProductsPageState';

interface ProductsFilterSheetProps {
  open: boolean;
  kind: CatalogKind;
  /** Brouillon de la fenêtre : appliqué seulement par `onApply`. */
  draft: ProductsSelection;
  onDraftChange: (draft: ProductsSelection) => void;
  search: string;
  onClose: () => void;
  onApply: () => void;
}

/** Fenêtre Filtres d'Articles : Type, Stock, État, Trier par ; nombres du brouillon. */
export function ProductsFilterSheet({
  open, kind, draft, onDraftChange, search, onClose, onApply,
}: ProductsFilterSheetProps) {
  const t = useTranslations('articles.filterSheet');
  const tList = useTranslations('articles.list');
  const { data: facets } = useProductsFacets(selectionFilters(draft, search), { enabled: open });
  const { stateOptions, typeOptions, stockOptions, sortOptions } = useProductFilterOptions(kind, facets);
  // Le nombre du bouton : celui de l'état choisi, avec les autres filtres du brouillon.
  const count = facets?.state[draft.state];
  const set = (patch: Partial<ProductsSelection>) => onDraftChange({ ...draft, ...patch });
  const isEmpty = draft.state === EMPTY_FILTERS.state && draft.type === EMPTY_FILTERS.type
    && draft.stock === EMPTY_FILTERS.stock;

  return (
    <ListFilterSheet
      open={open}
      onClose={onClose}
      onReset={() => set(EMPTY_FILTERS)}
      resetDisabled={isEmpty}
      applyLabel={count === undefined ? t('apply', { kind }) : t('show_results', { kind, count })}
      onApply={onApply}
    >
      {kind === 'both' && (
        <FilterSheetSection title={tList('type_title')} value={draft.type} options={typeOptions}
          onChange={(type) => set({ type })} />
      )}
      {kind !== 'services' && (
        <FilterSheetSection title={tList('stock_title')} value={draft.stock} options={stockOptions}
          onChange={(stock) => set({ stock })} />
      )}
      <FilterSheetSection title={tList('state_title')} value={draft.state} options={stateOptions}
        onChange={(state) => set({ state })} />
      <FilterSheetSection title={t('sort_title')} value={draft.ordering} options={sortOptions}
        onChange={(ordering) => set({ ordering })} />
    </ListFilterSheet>
  );
}
