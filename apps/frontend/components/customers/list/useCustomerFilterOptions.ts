'use client';

import { useTranslations } from 'next-intl';
import type { CustomersFacets } from '@/lib/hooks/useCustomers';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { parseOrdering } from '@/components/list/dataTableTypes';
import { SITUATIONS, type Situation } from './useCustomersPageState';

/** Pastille de chaque situation : ambre pour l'impayé, atténuée pour les désactivés. */
const SITUATION_DOT: Record<Situation, string | undefined> = {
  all: undefined,
  active: 'bg-green-500',
  pending: 'bg-amber-500',
  deactivated: 'bg-muted-foreground/50',
};

/** Tris de la fenêtre mobile. */
const MOBILE_SORTS = [
  { value: 'name', key: 'sort_name' },
  { value: '-pending_amount', key: 'sort_pending' },
  { value: '-last_order_at', key: 'sort_last_order' },
  { value: '-paid_amount', key: 'sort_paid' },
  { value: '-created_at', key: 'sort_newest' },
] as const;

const SORT_FIELDS = ['name', 'pending_amount', 'paid_amount', 'order_count', 'last_order_at', 'created_at'] as const;
type SortField = (typeof SORT_FIELDS)[number];

/**
 * Déclaration unique du filtre Situation et des tris de Clients, pour le menu
 * desktop comme pour la fenêtre mobile ; nombres fournis par `facets`.
 */
export function useCustomerFilterOptions(facets?: CustomersFacets) {
  const t = useTranslations('customers.list');
  const tSheet = useTranslations('customers.filterSheet');

  const situationOptions: FilterOption<Situation>[] = SITUATIONS.map((value) => ({
    value,
    label: t(`situation.${value}`),
    dotClassName: SITUATION_DOT[value],
    count: facets?.situation[value],
  }));
  const sortOptions: FilterOption<string>[] = MOBILE_SORTS.map(({ value, key }) => ({ value, label: tSheet(key) }));
  const sortLabel = (ordering: string): string => {
    const sort = parseOrdering(ordering);
    const field: SortField = SORT_FIELDS.includes(sort.field as SortField) ? (sort.field as SortField) : 'name';
    return t(`sort.${field}`, { dir: sort.direction });
  };

  return { situationOptions, sortOptions, sortLabel };
}
