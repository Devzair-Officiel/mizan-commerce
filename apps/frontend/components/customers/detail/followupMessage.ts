import type { OrderSummary } from '@/lib/hooks/useOrders';

type WaTranslator = (key: string, params?: Record<string, string | number>) => string;
type MoneyFmt = (v: string | number, currency: string, opts?: Intl.NumberFormatOptions) => string;
type DateFmt = (v: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;

/** Reste dû d'une commande, en centimes entiers pour éviter les arrondis flottants. */
function due(order: OrderSummary): number {
  const cents = (v: string) => Math.round(Number(v) * 100);
  return (cents(order.total_amount) - cents(order.amount_paid)) / 100;
}

/** Message de relance : une ligne par commande impayée, puis le total restant. */
export function buildFollowupMessage(
  name: string,
  orders: OrderSummary[],
  total: string,
  ctx: { tWa: WaTranslator; formatMoney: MoneyFmt; formatDate: DateFmt; currency: string },
): string {
  const { tWa, formatMoney, formatDate, currency } = ctx;
  const firstName = name.trim().split(/\s+/)[0] ?? '';
  const money = (v: string | number) => formatMoney(v, currency, { maximumFractionDigits: 2 });
  const lines = orders.map((o) => tWa('order_line', {
    number: o.order_number,
    date: formatDate(new Date(o.created_at), { day: 'numeric', month: 'short', year: 'numeric' }),
    amount: money(due(o)),
  }));
  return [
    firstName ? tWa('hello_named', { name: firstName }) : tWa('hello'),
    '',
    tWa('intro'),
    ...lines,
    '',
    tWa('total_line', { amount: money(total) }),
    '',
    tWa('signoff'),
  ].join('\n');
}
