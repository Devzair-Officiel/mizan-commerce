'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/dialog';
import type { InvoiceDetailState } from './useInvoiceDetailState';

/** Confirmations du menu : marquer payée, annuler ; fermeture bloquée pendant l'exécution. */
export function InvoiceDetailDialogs({ state }: { state: InvoiceDetailState }) {
  const t = useTranslations('invoices.detail');
  const paid = state.confirm === 'paid';
  return <ConfirmDialog open={state.confirm !== null} onOpenChange={open => { if (!open && !state.pending) state.setConfirm(null); }}
    title={t(paid ? 'confirm_paid_title' : 'confirm_cancel_title')} description={t(paid ? 'confirm_paid_body' : 'confirm_cancel_body')}
    confirmLabel={t('confirm')} cancelLabel={t('keep_invoice')} variant={paid ? 'default' : 'destructive'} onConfirm={state.submit} />;
}
