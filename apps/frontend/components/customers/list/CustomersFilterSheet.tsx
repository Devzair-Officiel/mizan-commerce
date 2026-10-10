'use client';

import { useTranslations } from 'next-intl';
import { ListFilterSheet } from '@/components/list/ListFilterSheet';
import { FilterSheetSection } from '@/components/list/FilterSheetSection';
import { useCustomersFacets } from '@/lib/hooks/useCustomers';
import { useCustomerFilterOptions } from './useCustomerFilterOptions';
import { EMPTY_FILTERS, selectionFilters, type CustomersSelection } from './useCustomersPageState';

interface CustomersFilterSheetProps {
  open: boolean;
  /** Brouillon de la fenêtre : appliqué seulement par `onApply`. */
  draft: CustomersSelection;
  onDraftChange: (draft: CustomersSelection) => void;
  search: string;
  onClose: () => void;
  onApply: () => void;
}

/** Fenêtre Filtres de Clients : Situation, Trier par ; nombres du brouillon. */
export function CustomersFilterSheet({ open, draft, onDraftChange, search, onClose, onApply }: CustomersFilterSheetProps) {
  const t = useTranslations('customers.filterSheet');
  const tList = useTranslations('customers.list');
  const { data: facets } = useCustomersFacets(selectionFilters(draft, search), { enabled: open });
  const { situationOptions, sortOptions } = useCustomerFilterOptions(facets);
  const count = facets?.situation[draft.situation];
  const set = (patch: Partial<CustomersSelection>) => onDraftChange({ ...draft, ...patch });
  const isEmpty = draft.situation === EMPTY_FILTERS.situation && !draft.month;

  return (
    <ListFilterSheet
      open={open}
      onClose={onClose}
      onReset={() => set(EMPTY_FILTERS)}
      resetDisabled={isEmpty}
      applyLabel={count === undefined ? t('apply') : t('show_results', { count })}
      onApply={onApply}
    >
      <FilterSheetSection title={tList('situation_title')} value={draft.situation} options={situationOptions}
        onChange={(situation) => set({ situation })} />
      <FilterSheetSection title={t('sort_title')} value={draft.ordering} options={sortOptions}
        onChange={(ordering) => set({ ordering })} />
    </ListFilterSheet>
  );
}
