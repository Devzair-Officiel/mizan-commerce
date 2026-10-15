'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListMobileToolbar, type ActiveFilter } from '@/components/list/ListMobileToolbar';
import { InvoicesFilterSheet } from './InvoicesFilterSheet';
import { useInvoiceFilterOptions } from './useInvoiceFilterOptions';
import type { InvoicesPageState } from './useInvoicesPageState';

export function InvoicesFiltersMobile({ state }: { state: InvoicesPageState }) {
  const t = useTranslations('invoices.list');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(state.selection);
  const { statusOptions, paymentOptions, periodOptions, sortLabel } = useInvoiceFilterOptions();
  const activeFilters: ActiveFilter[] = [];
  if (state.selection.status) activeFilters.push({ name: t('status_title'), option: statusOptions.find(o => o.value === state.selection.status)!, onRemove: () => state.set({ status: '' }) });
  if (state.selection.payment !== 'all') activeFilters.push({ name: t('payment_title'), option: paymentOptions.find(o => o.value === state.selection.payment)!, onRemove: () => state.set({ payment: 'all' }) });
  if (state.selection.period) activeFilters.push({ name: t('period_title'), option: periodOptions.find(o => o.value === state.selection.period)!, onRemove: () => state.set({ period: '' }) });
  return <>
    <ListMobileToolbar searchValue={state.searchInput} onSearchChange={state.setSearch} searchLabel={t('search_label')}
      searchPlaceholder={t('search_placeholder')} activeFilters={activeFilters} sortLabel={sortLabel(state.ordering)}
      onOpenFilters={() => { setDraft(state.selection); setOpen(true); }} />
    <InvoicesFilterSheet open={open} draft={draft} onChange={setDraft} search={state.search} onClose={() => setOpen(false)}
      onApply={() => { state.apply(draft); setOpen(false); }} />
  </>;
}
