'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ShoppingBag, XCircle } from 'lucide-react';
import type { DetailMenuActions } from '@/components/detail/types';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { getPaymentDisplay } from './payment';
import type { InvoiceDetailState } from './useInvoiceDetailState';

/** Menu « ⋯ » d'une facture : marquer payée (rien à encaisser une fois créditée), commande liée, annuler. */
export function useInvoiceMenu(invoice: Invoice, state: InvoiceDetailState): DetailMenuActions {
  const router = useRouter();
  const t = useTranslations('invoices.detail');
  const menu: DetailMenuActions = { items: [], danger: null };
  if (invoice.status === 'issued' && !invoice.order && getPaymentDisplay(invoice).state !== 'credited') menu.items.push({
    key: 'paid', label: t('mark_paid'), icon: CheckCircle2, onSelect: () => state.setConfirm('paid'), disabled: state.pending,
  });
  if (invoice.order) menu.items.push({
    key: 'order', label: t('linked_order'), icon: ShoppingBag, onSelect: () => router.push(`/orders/${invoice.order}`),
  });
  if (invoice.status !== 'cancelled') menu.danger = {
    key: 'cancel', label: t('cancel_invoice'), icon: XCircle, destructive: true,
    onSelect: () => state.setConfirm('cancelled'), disabled: state.pending,
  };
  return menu;
}
