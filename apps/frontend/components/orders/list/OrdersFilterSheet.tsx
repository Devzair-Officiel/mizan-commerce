'use client';

import { useTranslations } from 'next-intl';
import { ListFilterSheet } from '@/components/list/ListFilterSheet';
import { FilterSheetSection } from '@/components/list/FilterSheetSection';
import { useOrdersFacets } from '@/lib/hooks/useOrders';
import { useOrderFilterOptions } from './useOrderFilterOptions';
import { EMPTY_FILTERS, selectionFilters, type OrdersSelection } from './useOrdersPageState';

interface OrdersFilterSheetProps {
  open: boolean;
  /** Brouillon de la fenêtre : appliqué seulement par `onApply`. */
  draft: OrdersSelection;
  onDraftChange: (draft: OrdersSelection) => void;
  search: string;
  onClose: () => void;
  onApply: () => void;
}

/** Fenêtre Filtres de Commandes : Statut, Paiement, Trier par ; nombres du brouillon. */
export function OrdersFilterSheet({ open, draft, onDraftChange, search, onClose, onApply }: OrdersFilterSheetProps) {
  const t = useTranslations('orders.filterSheet');
  const { data: facets } = useOrdersFacets(selectionFilters(draft, search), { enabled: open });
  const { statusOptions, paymentOptions, sortOptions } = useOrderFilterOptions(facets);
  const count = facets?.status[draft.status || 'all'];
  const set = (patch: Partial<OrdersSelection>) => onDraftChange({ ...draft, ...patch });
  const isEmpty = draft.status === EMPTY_FILTERS.status && draft.payment === EMPTY_FILTERS.payment && !draft.month;

  return (
    <ListFilterSheet
      open={open}
      onClose={onClose}
      onReset={() => set(EMPTY_FILTERS)}
      resetDisabled={isEmpty}
      applyLabel={count === undefined ? t('apply') : t('show_results', { count })}
      onApply={onApply}
    >
      <FilterSheetSection title={t('status_title')} value={draft.status} options={statusOptions}
        onChange={(status) => set({ status })} />
      <FilterSheetSection title={t('payment_title')} value={draft.payment} options={paymentOptions}
        onChange={(payment) => set({ payment })} />
      <FilterSheetSection title={t('sort_title')} value={draft.ordering} options={sortOptions}
        onChange={(ordering) => set({ ordering })} />
    </ListFilterSheet>
  );
}
