'use client';

import { useTranslations } from 'next-intl';
import { ListToolbar } from '@/components/list/ListToolbar';
import { FilterMenuButton } from '@/components/list/FilterMenuButton';
import { FilterChip } from '@/components/list/FilterChip';
import { useInvoicesFacets } from '@/lib/hooks/useInvoices';
import { useInvoiceFilterOptions } from './useInvoiceFilterOptions';
import type { InvoicesPageState } from './useInvoicesPageState';

export function InvoicesToolbar({ state }: { state: InvoicesPageState }) {
  const t = useTranslations('invoices.list');
  const { data } = useInvoicesFacets(state.filters);
  const { statusOptions, paymentOptions, sortLabel } = useInvoiceFilterOptions(data);
  return <ListToolbar searchValue={state.searchInput} onSearchChange={state.setSearch} searchLabel={t('search_label')}
    searchPlaceholder={t('search_placeholder')} clearLabel={t('clear_filters')} onClear={state.isFiltered ? state.clearFilters : undefined}
    sortLabel={sortLabel(state.ordering)} filters={<>
      <FilterMenuButton label={t('status_title')} value={state.selection.status} allValue="" options={statusOptions} onChange={status => state.set({ status })} />
      <FilterMenuButton label={t('payment_title')} value={state.selection.payment} allValue="all" options={paymentOptions} onChange={payment => state.set({ payment })} />
      {state.selection.period && <FilterChip name={t('period_title')} value={t(`stats.${state.selection.period}`)} onRemove={() => state.set({ period: '' })} />}
    </>} />;
}
