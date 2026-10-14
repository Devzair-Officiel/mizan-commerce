import type { OrderSummary } from '@/lib/hooks/useOrders';

type DueOrder = Pick<OrderSummary, 'total_amount' | 'amount_paid'>;

/** Reste dû d'une commande, en centimes entiers pour éviter les arrondis flottants. */
export function orderDue(order: DueOrder): number {
  const cents = (v: string) => Math.round(Number(v) * 100);
  return (cents(order.total_amount) - cents(order.amount_paid)) / 100;
}
