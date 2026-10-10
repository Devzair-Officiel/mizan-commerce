'use client';

import { useTranslations } from 'next-intl';
import { useShop } from '@/lib/hooks/useShop';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import type { FilterOption } from '@/components/list/FilterMenuButton';
import { STATUSES, type StatusFilterKey } from './constants';
import type { PaymentFilter } from './useOrdersPageState';

/**
 * Options des filtres Statut et Paiement, communes au menu desktop et à la
 * feuille mobile : statuts du parcours de la boutique, annulées en dernier.
 */
export function useOrderFilterOptions() {
  const tStat = useTranslations('orders.statusFilter');
  const tPay = useTranslations('orders.paymentFilter');
  const label = useOrderStatusLabel();
  const { data: shop } = useShop();
  const fm = shop?.fulfillment_mode ?? null;

  const statusLabel = (v: StatusFilterKey): string => (v ? label(v, true) : tStat('all'));
  const statusOptions: FilterOption<StatusFilterKey>[] = STATUSES
    .filter(({ value }) => value !== 'prepared' || fm === 'delivery')
    .map(({ value }) => ({ value, label: statusLabel(value) }));
  const paymentOptions: FilterOption<PaymentFilter>[] = (['all', 'due', 'paid'] as const)
    .map((value) => ({ value, label: tPay(value) }));

  return { statusOptions, paymentOptions, statusLabel };
}
