'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListMobileToolbar, type ActiveFilter } from '@/components/list/ListMobileToolbar';
import { OrdersFilterSheet } from './OrdersFilterSheet';
import { useOrderFilterOptions } from './useOrderFilterOptions';
import type { OrdersPageState, OrdersSelection } from './useOrdersPageState';

/** Barre d'outils mobile de Commandes et sa fenêtre Filtres (validation explicite). */
export function OrdersFiltersMobile({ state }: { state: OrdersPageState }) {
  const t = useTranslations('orders.list');
  const tSheet = useTranslations('orders.filterSheet');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OrdersSelection>(state.selection);
  const { statusOptions, paymentOptions, statusLabel, sortLabel } = useOrderFilterOptions();
  const { statusFilter, paymentFilter, isMonth } = state;

  const status = statusOptions.find((o) => o.value === statusFilter) ?? { value: statusFilter, label: statusLabel(statusFilter) };
  const payment = paymentOptions.find((o) => o.value === paymentFilter);
  const activeFilters = [
    statusFilter && { name: tSheet('status_title'), option: status, onRemove: () => state.handleStatusFilter('') },
    paymentFilter !== 'all' && payment && { name: tSheet('payment_title'), option: payment, onRemove: () => state.handlePaymentFilter('all') },
    isMonth && { name: t('stats.month_label'), option: { value: 'month', label: t('stats.month_label') }, onRemove: () => state.handlePeriod(false) },
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
      <OrdersFilterSheet open={open} draft={draft} onDraftChange={setDraft} search={state.search}
        onClose={() => setOpen(false)} onApply={apply} />
    </>
  );
}
