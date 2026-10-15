'use client';

import { useTranslations } from 'next-intl';
import { ListFilterSheet } from '@/components/list/ListFilterSheet';
import { FilterSheetSection } from '@/components/list/FilterSheetSection';
import { useInvoicesFacets } from '@/lib/hooks/useInvoices';
import { useInvoiceFilterOptions } from './useInvoiceFilterOptions';
import { EMPTY_FILTERS, selectionFilters, type InvoiceSelection } from './useInvoicesPageState';

export function InvoicesFilterSheet({ open, draft, onChange, search, onClose, onApply }: {
  open: boolean; draft: InvoiceSelection; onChange: (s: InvoiceSelection) => void; search: string; onClose: () => void; onApply: () => void;
}) {
  const t = useTranslations('invoices.list');
  const { data } = useInvoicesFacets(selectionFilters(draft, search), { enabled: open });
  const { statusOptions, paymentOptions, periodOptions, sortOptions } = useInvoiceFilterOptions(data);
  const count = data?.status[draft.status || 'all'];
  const set = (patch: Partial<InvoiceSelection>) => onChange({ ...draft, ...patch });
  return <ListFilterSheet open={open} onClose={onClose} onReset={() => set(EMPTY_FILTERS)}
    resetDisabled={!draft.status && draft.payment === 'all' && !draft.period}
    applyLabel={count === undefined ? t('apply') : t('show_results', { count })} onApply={onApply}>
    <FilterSheetSection title={t('status_title')} value={draft.status} options={statusOptions} onChange={status => set({ status })} />
    <FilterSheetSection title={t('payment_title')} value={draft.payment} options={paymentOptions} onChange={payment => set({ payment })} />
    <FilterSheetSection title={t('period_title')} value={draft.period} options={periodOptions} onChange={period => set({ period })} />
    <FilterSheetSection title={t('sort_title')} value={draft.ordering} options={sortOptions} onChange={ordering => set({ ordering })} />
  </ListFilterSheet>;
}
