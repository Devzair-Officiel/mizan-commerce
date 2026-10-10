'use client';

import { useTranslations } from 'next-intl';
import { ListToolbar } from '@/components/list/ListToolbar';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import { FilterChip } from '@/components/list/FilterChip';
import { useCustomer } from '@/lib/hooks/useCustomers';
import { useOrdersFacets } from '@/lib/hooks/useOrders';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useOrderFilterOptions } from './useOrderFilterOptions';
import type { OrdersPageState } from './useOrdersPageState';

/** Barre d'outils desktop de Commandes : recherche, Statut, Paiement, client choisi, tri courant. */
export function OrdersToolbar({ state }: { state: OrdersPageState }) {
  const t = useTranslations('orders.list');
  const tSheet = useTranslations('orders.filterSheet');
  const isDesktop = useIsDesktop();
  const { data: facets } = useOrdersFacets(state.filters, { enabled: isDesktop === true });
  const { statusOptions, paymentOptions, sortLabel } = useOrderFilterOptions(facets);
  const { data: customer } = useCustomer(state.customer);

  return (
    <ListToolbar
      searchValue={state.searchInput}
      onSearchChange={state.setSearchInput}
      searchLabel={t('search_label')}
      searchPlaceholder={t('search_placeholder')}
      filters={
        <>
          <FilterMenuButton label={tSheet('status_title')} value={state.statusFilter} allValue=""
            options={statusOptions} onChange={state.handleStatusFilter} />
          <FilterMenuButton label={tSheet('payment_title')} value={state.paymentFilter} allValue="all"
            options={paymentOptions} onChange={state.handlePaymentFilter} />
          {state.customer && (
            <FilterChip name={t('customer_filter')} value={customer?.name ?? '…'} onRemove={state.clearCustomer} />
          )}
        </>
      }
      clearLabel={t('clear_filters')}
      onClear={state.isFiltered ? state.clearFilters : undefined}
      sortLabel={sortLabel(state.ordering)}
    />
  );
}
