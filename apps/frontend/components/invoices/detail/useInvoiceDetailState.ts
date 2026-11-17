'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { notify } from '@/lib/notify';
import { useInvoice, useUpdateInvoiceStatus } from '@/lib/hooks/useInvoices';

export function useInvoiceDetailState(id: string) {
  const query = useInvoice(id);
  const update = useUpdateInvoiceStatus(id);
  const t = useTranslations('invoices.detail');
  const [confirm, setConfirm] = useState<'paid' | null>(null);
  /** Feuille « Créer un avoir » ouverte. */
  const [crediting, setCrediting] = useState(false);
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
  return { invoice: query.data, isLoading: query.isLoading, confirm, setConfirm, crediting, setCrediting, submit, pending: update.isPending };
}
export type InvoiceDetailState = ReturnType<typeof useInvoiceDetailState>;
