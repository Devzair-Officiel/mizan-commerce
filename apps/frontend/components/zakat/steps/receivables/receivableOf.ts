import type { OrderSummary, ReceivableItem } from '@/lib/hooks/useZakat';

/** Créance copiée d'une commande : mêmes champs que la copie faite par le serveur à la création. */
export function receivableOf(order: OrderSummary): ReceivableItem {
  return {
    order_id: order.order_id,
    label: order.customer_name ?? order.order_number ?? '',
    amount: order.remaining ?? '0',
    doubtful: false,
  };
}
