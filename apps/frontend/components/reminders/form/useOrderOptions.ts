'use client';

import { useTranslations } from 'next-intl';
import { orderDue } from '@/components/customers/detail/followupMessage';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrder, useOrders } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { isolateNumber } from '@/components/orders/OrderNumber';

/** Valeur du menu pour « Aucune commande » (le formulaire garde une chaîne vide). */
export const NO_ORDER = 'none';

interface OrderLike { id: string; order_number: string; created_at: string; total_amount: string; amount_paid: string }

/**
 * Choix de « Commande » : les commandes non soldées du client, plus la commande déjà liée si elle
 * n'en fait pas partie (soldée depuis, ouverte depuis sa fiche, ou commande sans client).
 */
export function useOrderOptions(customer: string, order: string) {
  const t = useTranslations('reminders.form');
  const formatMoney = useFormatMoney();
  const { data: shop } = useShop();
  const { data: due } = useOrders({ customer, due: true }, { enabled: !!customer });
  const unsettled: OrderLike[] = customer ? due?.results ?? [] : [];
  const missing = !!order && !unsettled.some((o) => o.id === order);
  const { data: linked } = useOrder(missing ? order : '');
  const orders = missing && linked ? [...unsettled, linked] : unsettled;

  const label = (o: OrderLike) => {
    const amount = orderDue(o);
    return amount > 0
      ? t('order_option', { number: isolateNumber(o.order_number), amount: formatMoney(amount, shop?.currency ?? 'EUR') })
      : t('order_option_settled', { number: isolateNumber(o.order_number) });
  };
  return [{ value: NO_ORDER, label: t('order_none') }, ...orders.map((o) => ({ value: o.id, label: label(o) }))];
}
