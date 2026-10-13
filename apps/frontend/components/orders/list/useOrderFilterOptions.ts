'use client';

import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import type { OrdersFacets } from '@/lib/hooks/useOrders';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { parseOrdering } from '@/components/list/dataTableTypes';
import { PAYMENT_BADGE, STATUS_BAR, STATUSES, type StatusFilterKey } from './constants';
import type { PaymentFilter } from './useOrdersPageState';

/** Badge de chaque option de paiement : celui du tableau pour le même état. */
const PAYMENT_OPTION_BADGE: Record<PaymentFilter, string | undefined> = {
  all: undefined,
  due: PAYMENT_BADGE.unpaid,
  paid: PAYMENT_BADGE.paid,
};

/** Tris de la fenêtre mobile : date et montant, dans les deux sens. */
const MOBILE_SORTS = [
  { value: '-created_at', key: 'sort_newest' },
  { value: 'created_at', key: 'sort_oldest' },
  { value: '-total_amount', key: 'sort_amount_desc' },
  { value: 'total_amount', key: 'sort_amount_asc' },
] as const;

/** Champ de tri DRF → clé du libellé « Trié par … ». */
const SORT_KEYS = {
  order_number: 'order_number',
  customer__name: 'customer_name',
  created_at: 'created_at',
  status: 'status',
  payment_status: 'payment_status',
  total_amount: 'total_amount',
} as const;

/**
 * Déclaration unique des filtres de Commandes, pour le menu desktop comme pour
 * la fenêtre mobile : statuts du parcours de la boutique (annulées en dernier),
 * paiement, tris mobiles et libellé du tri courant. Couleurs reprises du
 * tableau ; nombres fournis par `facets` quand il y en a.
 */
export function useOrderFilterOptions(facets?: OrdersFacets) {
  const tStat = useTranslations('orders.statusFilter');
  const tPay = useTranslations('orders.paymentFilter');
  const tSheet = useTranslations('orders.filterSheet');
  const tList = useTranslations('orders.list');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const fm = shop?.fulfillment_mode ?? null;

  const statusLabel = (v: StatusFilterKey): string => (v ? label(v, true) : tStat('all'));
  const statusOptions: FilterOption<StatusFilterKey>[] = STATUSES
    .filter(({ value }) => value !== 'prepared' || fm === 'delivery')
    .map(({ value }) => ({
      value,
      label: statusLabel(value),
      dotClassName: value ? STATUS_BAR[value] : undefined,
      count: facets?.status[value || 'all'],
    }));
  const paymentOptions: FilterOption<PaymentFilter>[] = (['all', 'due', 'paid'] as const)
    .map((value) => ({
      value,
      label: tPay(value),
      badgeClassName: PAYMENT_OPTION_BADGE[value],
      count: facets?.payment[value],
    }));

  const sortOptions: FilterOption<string>[] = MOBILE_SORTS.map(({ value, key }) => ({ value, label: tSheet(key) }));
  const sortLabel = (ordering: string): string => {
    const sort = parseOrdering(ordering);
    const key = SORT_KEYS[sort.field as keyof typeof SORT_KEYS] ?? 'created_at';
    return tList(`sort.${key}`, { dir: sort.direction });
  };

  return { statusOptions, paymentOptions, sortOptions, statusLabel, sortLabel };
}
