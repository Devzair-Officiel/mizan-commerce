'use client';

import { useTranslations } from 'next-intl';
import { ListToolbar } from '@/components/list/ListToolbar';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import { useCustomersFacets } from '@/lib/hooks/useCustomers';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useCustomerFilterOptions } from './useCustomerFilterOptions';
import type { CustomersPageState } from './useCustomersPageState';

/** Barre d'outils desktop de Clients : recherche, Situation, tri courant. */
export function CustomersToolbar({ state }: { state: CustomersPageState }) {
  const t = useTranslations('customers.list');
  const isDesktop = useIsDesktop();
  const { data: facets } = useCustomersFacets(state.filters, { enabled: isDesktop === true });
  const { situationOptions, sortLabel } = useCustomerFilterOptions(facets);

  return (
    <ListToolbar
      searchValue={state.searchInput}
      onSearchChange={state.setSearchInput}
      searchLabel={t('search_label')}
      searchPlaceholder={t('search_placeholder')}
      filters={
        <FilterMenuButton label={t('situation_title')} value={state.situation} allValue="all"
          options={situationOptions} onChange={state.handleSituation} />
      }
      clearLabel={t('clear_filters')}
      onClear={state.isFiltered ? state.clearFilters : undefined}
      sortLabel={sortLabel(state.ordering)}
    />
  );
}
