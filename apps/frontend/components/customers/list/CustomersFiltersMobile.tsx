'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListMobileToolbar, type ActiveFilter } from '@/components/list/ListMobileToolbar';
import { CustomersFilterSheet } from './CustomersFilterSheet';
import { useCustomerFilterOptions } from './useCustomerFilterOptions';
import type { CustomersPageState, CustomersSelection } from './useCustomersPageState';

/** Barre d'outils mobile de Clients et sa fenêtre Filtres (validation explicite). */
export function CustomersFiltersMobile({ state }: { state: CustomersPageState }) {
  const t = useTranslations('customers.list');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CustomersSelection>(state.selection);
  const { situationOptions, sortLabel } = useCustomerFilterOptions();

  const situation = situationOptions.find((o) => o.value === state.situation);
  const activeFilters = [
    state.situation !== 'all' && situation && { name: t('situation_title'), option: situation, onRemove: () => state.handleSituation('all') },
    state.isMonth && { name: t('stats.new_label'), option: { value: 'month', label: t('stats.new_label') }, onRemove: () => state.handlePeriod(false) },
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
        searchLabel={t('search_label')}
        searchPlaceholder={t('search_placeholder')}
        activeFilters={activeFilters}
        onOpenFilters={openSheet}
        sortLabel={sortLabel(state.ordering)}
      />
      <CustomersFilterSheet open={open} draft={draft} onDraftChange={setDraft} search={state.search}
        onClose={() => setOpen(false)} onApply={apply} />
    </>
  );
}
