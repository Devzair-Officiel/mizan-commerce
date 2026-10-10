'use client';

import { useTranslations } from 'next-intl';
import { ListToolbar } from '@/components/list/ListToolbar';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import { parseOrdering } from '@/components/list/dataTableTypes';
import { useOrderFilterOptions } from './useOrderFilterOptions';
import type { OrdersPageState } from './useOrdersPageState';

const SORT_KEYS = {
  order_number: 'order_number',
  customer__name: 'customer_name',
  created_at: 'created_at',
  status: 'status',
  payment_status: 'payment_status',
  total_amount: 'total_amount',
} as const;

/** Barre d'outils desktop de Commandes : recherche, Statut, Paiement, tri courant. */
export function OrdersToolbar({ state }: { state: OrdersPageState }) {
  const t = useTranslations('orders.list');
  const tSheet = useTranslations('orders.filterSheet');
  const { statusOptions, paymentOptions } = useOrderFilterOptions();
  const sort = parseOrdering(state.ordering);
  const sortKey = SORT_KEYS[sort.field as keyof typeof SORT_KEYS] ?? 'created_at';

  return (
    <ListToolbar
      searchValue={state.searchInput}
      onSearchChange={state.setSearchInput}
      searchLabel={t('search_label')}
      searchPlaceholder={t('search_placeholder')}
      filters={
        <>
          <FilterMenuButton label={tSheet('status_title')} value={state.statusFilter}
            options={statusOptions} onChange={state.handleStatusFilter} />
          <FilterMenuButton label={tSheet('payment_title')} value={state.paymentFilter}
            options={paymentOptions} onChange={state.handlePaymentFilter} />
        </>
      }
      clearLabel={t('clear_filters')}
      onClear={state.isFiltered ? state.clearFilters : undefined}
      sortLabel={t(`sort.${sortKey}`, { dir: sort.direction })}
    />
  );
}
