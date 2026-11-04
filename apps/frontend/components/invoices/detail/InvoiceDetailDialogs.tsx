'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/dialog';
import type { InvoiceDetailState } from './useInvoiceDetailState';

/** Confirmation du menu « Marquer payée » ; fermeture bloquée pendant l'exécution. */
export function InvoiceDetailDialogs({ state }: { state: InvoiceDetailState }) {
  const t = useTranslations('invoices.detail');
  return <ConfirmDialog open={state.confirm !== null} onOpenChange={open => { if (!open && !state.pending) state.setConfirm(null); }}
    title={t('confirm_paid_title')} description={t('confirm_paid_body')}
    confirmLabel={t('confirm')} cancelLabel={t('keep_invoice')} variant="default" onConfirm={state.submit} />;
}
