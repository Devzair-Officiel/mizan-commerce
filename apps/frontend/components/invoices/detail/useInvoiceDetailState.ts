'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ShoppingBag, XCircle } from 'lucide-react';
import { notify } from '@/lib/notify';
import { useInvoice, useUpdateInvoiceStatus } from '@/lib/hooks/useInvoices';
import type { DetailMenuActions } from '@/components/detail/types';

export function useInvoiceDetailState(id: string) {
  const query = useInvoice(id);
  const update = useUpdateInvoiceStatus(id);
  const router = useRouter();
  const t = useTranslations('invoices.detail');
  const [confirm, setConfirm] = useState<'paid' | 'cancelled' | null>(null);
  const invoice = query.data;
  const menu: DetailMenuActions = { items: [], danger: null };
  if (invoice?.status === 'issued' && !invoice.order) menu.items.push({
    key: 'paid', label: t('mark_paid'), icon: CheckCircle2, onSelect: () => setConfirm('paid'), disabled: update.isPending,
  });
  if (invoice?.order) menu.items.push({
    key: 'order', label: t('linked_order'), icon: ShoppingBag, onSelect: () => router.push(`/orders/${invoice.order}`),
  });
  if (invoice && invoice.status !== 'cancelled') menu.danger = {
    key: 'cancel', label: t('cancel_invoice'), icon: XCircle, destructive: true,
    onSelect: () => setConfirm('cancelled'), disabled: update.isPending,
  };
  const submit = async () => {
    if (!confirm) return;
    try {
      await update.mutateAsync(confirm);
      setConfirm(null);
      notify.success(t('status_saved'));
    } catch {
      notify.error(t('status_error'));
      throw new Error(t('status_error'));
    }
  };
  return { invoice, isLoading: query.isLoading, menu, confirm, setConfirm, submit, pending: update.isPending };
}
export type InvoiceDetailState = ReturnType<typeof useInvoiceDetailState>;
