import type { InvoiceStatus } from '@/lib/hooks/useInvoices';
export const STATUS_DOT: Record<InvoiceStatus, string> = { issued: 'bg-amber-500', paid: 'bg-green-500', cancelled: 'bg-red-500' };
export const STATUS_BADGE: Record<InvoiceStatus, string> = {
  issued: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  paid: 'bg-green-500/10 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400',
};
export const PAYMENT_BADGE: Record<string, string> = {
  due: STATUS_BADGE.issued, unpaid: STATUS_BADGE.issued, partial: STATUS_BADGE.issued,
  paid: STATUS_BADGE.paid, cancelled: STATUS_BADGE.cancelled,
};
