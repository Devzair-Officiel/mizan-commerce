import type { Invoice, InvoiceStatus } from '@/lib/hooks/useInvoices';
export const STATUS_DOT: Record<InvoiceStatus, string> = { draft: 'bg-muted-foreground', issued: 'bg-amber-500', paid: 'bg-green-500', cancelled: 'bg-red-500' };
export const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  issued: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  paid: 'bg-green-500/10 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-500/10 text-red-700 dark:text-red-400',
};
export const PAYMENT_BADGE: Record<string, string> = {
  due: STATUS_BADGE.issued, unpaid: STATUS_BADGE.issued, partial: STATUS_BADGE.issued,
  paid: STATUS_BADGE.paid, cancelled: STATUS_BADGE.cancelled,
};

/** Un brouillon s'ouvre dans l'éditeur, une facture émise sur sa page détail. */
export const invoiceHref = (i: Pick<Invoice, 'id' | 'status'>) => i.status === 'draft' ? `/invoices/${i.id}/edit` : `/invoices/${i.id}`;
