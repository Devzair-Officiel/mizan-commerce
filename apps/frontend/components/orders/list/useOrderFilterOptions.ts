'use client';

import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import type { OrdersFacets } from '@/lib/hooks/useOrders';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { PAYMENT_BADGE, STATUS_BAR, STATUSES, type StatusFilterKey } from './constants';
import type { PaymentFilter } from './useOrdersPageState';

/** Badge de chaque option de paiement : celui du tableau pour le même état. */
const PAYMENT_OPTION_BADGE: Record<PaymentFilter, string | undefined> = {
  all: undefined,
  due: PAYMENT_BADGE.unpaid,
  paid: PAYMENT_BADGE.paid,
};

/**
 * Options des filtres Statut et Paiement, communes au menu desktop et à la
 * feuille mobile : statuts du parcours de la boutique, annulées en dernier.
 * Couleurs reprises du tableau ; nombres fournis par `facets` quand il y en a.
 */
export function useOrderFilterOptions(facets?: OrdersFacets) {
  const tStat = useTranslations('orders.statusFilter');
  const tPay = useTranslations('orders.paymentFilter');
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

  return { statusOptions, paymentOptions, statusLabel };
}
