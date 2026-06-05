import type { Order } from '@/lib/hooks/useOrders';

type WaTranslator = (key: string, params?: Record<string, string | number>) => string;
type MoneyFmt = (v: string | number, currency: string, opts?: Intl.NumberFormatOptions) => string;
type DateFmt = (v: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;

const STATUS_KEY: Record<string, string> = {
  draft:      'status_draft',
  to_prepare: 'status_to_prepare',
  prepared:   'status_prepared',
  shipped:    'status_shipped',
  cancelled:  'status_cancelled',
};

export function buildWhatsAppMessage(
  order: Order,
  ctx: { tWa: WaTranslator; formatMoney: MoneyFmt; formatDate: DateFmt; currency: string },
): string {
  const { tWa, formatMoney, formatDate, currency } = ctx;
  const firstName = (order.customer_name ?? '').trim().split(/\s+/)[0] ?? '';
  const total = parseFloat(order.total_amount);
  const paid = parseFloat(order.amount_paid);
  const remaining = Math.max(0, total - paid);
  const date = formatDate(new Date(order.created_at), { day: 'numeric', month: 'short', year: 'numeric' });
  const money = (v: number) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const statusKey = STATUS_KEY[order.status] ?? 'status_fallback';

  const paymentLine =
    order.payment_status === 'paid'
      ? tWa('payment_paid')
      : order.payment_status === 'partial'
        ? tWa('payment_partial', { paid: money(paid), remaining: money(remaining) })
        : tWa('payment_unpaid', { amount: money(total) });

  return [
    firstName ? tWa('hello_named', { name: firstName }) : tWa('hello'),
    '',
    tWa(statusKey),
    '',
    tWa('order_line', { number: order.order_number, date }),
    tWa('total_line', { amount: money(total) }),
    paymentLine,
    '',
    tWa('signoff'),
  ].join('\n');
}
