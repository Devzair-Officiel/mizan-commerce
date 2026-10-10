import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAddOrderItem, useRemoveOrderItem, useUpdateOrder, useUpdateOrderItem, type Order,
} from '@/lib/hooks/useOrders';
import { toItemPayload } from '@/lib/hooks/useNewSaleLines';
import { qk } from '@/lib/query-keys';
import type { LineItem } from '@/components/orders/new/types';

export interface OrderEditDraft {
  customerId: string;
  discount: string;
  shipping: string;
  items: LineItem[];
}

/** Brouillon construit depuis la commande : point de départ de l'écran de modification. */
export function draftFromOrder(order: Order): OrderEditDraft {
  const amount = (v: string) => (parseFloat(v) ? v : '');
  return {
    customerId: order.customer ?? '',
    discount: amount(order.discount_amount),
    shipping: amount(order.shipping_amount),
    items: order.items.map((i) => ({
      lineId: i.id, itemId: i.id, variant: i.variant, product: i.product_id,
      product_name: i.product_name, variant_name: i.variant_name, product_type: null,
      quantity: i.quantity, unit_price: i.unit_price,
    })),
  };
}

/** Le brouillon diffère-t-il de la commande enregistrée ? */
export function hasOrderChanges(order: Order, draft: OrderEditDraft): boolean {
  const num = (v: string) => parseFloat(v) || 0;
  if ((order.customer ?? '') !== draft.customerId) return true;
  if (num(order.discount_amount) !== num(draft.discount)) return true;
  if (num(order.shipping_amount) !== num(draft.shipping)) return true;
  if (draft.items.length !== order.items.length) return true;
  return draft.items.some((i) => order.items.find((o) => o.id === i.itemId)?.quantity !== i.quantity);
}

/**
 * Enregistre les différences entre la commande et le brouillon : champs de la commande,
 * lignes retirées, quantités changées, lignes ajoutées. Les appels sont faits un par un :
 * chacun recalcule les totaux et les réservations de stock côté serveur.
 */
export function useOrderEditSave(orderId: string) {
  const qc = useQueryClient();
  const updateOrder = useUpdateOrder(orderId);
  const addItem = useAddOrderItem(orderId);
  const updateItem = useUpdateOrderItem(orderId);
  const removeItem = useRemoveOrderItem(orderId);
  // Un seul indicateur pour toute la suite d'appels (sinon le bouton se réactive entre deux).
  const [isPending, setIsPending] = useState(false);

  async function save(order: Order, draft: OrderEditDraft): Promise<void> {
    setIsPending(true);
    try {
      await persist(order, draft);
    } finally {
      setIsPending(false);
      // Même après un échec partiel : totaux, réservations et stock affichés ailleurs.
      for (const queryKey of [qk.orders.all, qk.products.all, qk.stock.all, qk.dashboard.all, qk.navBadges.all]) {
        void qc.invalidateQueries({ queryKey });
      }
      for (const id of new Set([order.customer, draft.customerId])) {
        if (id) void qc.invalidateQueries({ queryKey: qk.customers.detail(id) });
      }
    }
  }

  async function persist(order: Order, draft: OrderEditDraft): Promise<void> {
    await updateOrder.mutateAsync({
      customer: draft.customerId || null,
      discount_amount: draft.discount || '0',
      shipping_amount: draft.shipping || '0',
    });
    const kept = new Set(draft.items.map((i) => i.itemId));
    for (const item of order.items) {
      if (!kept.has(item.id)) await removeItem.mutateAsync(item.id);
    }
    for (const line of draft.items) {
      const before = order.items.find((o) => o.id === line.itemId);
      if (!before) await addItem.mutateAsync(toItemPayload(line));
      else if (before.quantity !== line.quantity) await updateItem.mutateAsync({ itemId: before.id, quantity: line.quantity });
    }
  }

  return { save, isPending };
}
