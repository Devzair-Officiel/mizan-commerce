'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, FileMinus, ShoppingBag } from 'lucide-react';
import type { DetailMenuActions } from '@/components/detail/types';
import type { Invoice } from '@/lib/hooks/useInvoices';
import { getPaymentDisplay } from './payment';
import type { InvoiceDetailState } from './useInvoiceDetailState';

/**
 * Menu « ⋯ » d'une facture : marquer payée (rien à encaisser une fois créditée), créer un avoir
 * (facture émise ou payée, pas encore entièrement créditée), commande liée. Une facture émise ne
 * s'annule pas : l'avoir la corrige.
 */
export function useInvoiceMenu(invoice: Invoice, state: InvoiceDetailState): DetailMenuActions {
  const router = useRouter();
  const t = useTranslations('invoices.detail');
  const tCredit = useTranslations('invoices.credit');
  const menu: DetailMenuActions = { items: [], danger: null };
  if (invoice.status === 'issued' && !invoice.order && getPaymentDisplay(invoice).state !== 'credited') menu.items.push({
    key: 'paid', label: t('mark_paid'), icon: CheckCircle2, onSelect: () => state.setConfirm('paid'), disabled: state.pending,
  });
  if (invoice.kind === 'invoice' && (invoice.status === 'issued' || invoice.status === 'paid') && !invoice.fully_credited) menu.items.push({
    key: 'credit', label: tCredit('open'), icon: FileMinus, onSelect: () => state.setCrediting(true), disabled: state.pending,
  });
  if (invoice.order) menu.items.push({
    key: 'order', label: t('linked_order'), icon: ShoppingBag, onSelect: () => router.push(`/orders/${invoice.order}`),
  });
  return menu;
}
