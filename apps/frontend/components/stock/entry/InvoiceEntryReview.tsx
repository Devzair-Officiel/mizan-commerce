'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FormActions } from '@/components/form/FormActions';
import { FormCard } from '@/components/form/FormCard';
import { useFormLeave } from '@/components/form/useFormLeave';
import { ApiError } from '@/lib/api-client';
import type { OcrResult } from '@/lib/hooks/useOcr';
import { useStockEntry } from '@/lib/hooks/useStock';
import { notify } from '@/lib/notify';
import { useStockFormat } from '../useStockFormat';
import { InvoiceReviewAlert } from './InvoiceReviewAlert';
import { invoiceCandidates, invoiceDefaults } from './invoiceDefaults';
import { StockEntryFooter } from './StockEntryFooter';
import { StockEntryLines } from './StockEntryLines';
import { StockEntrySupplierSection } from './StockEntrySupplierSection';
import { entryPayload, useStockEntryForm } from './useStockEntryForm';

interface InvoiceEntryReviewProps {
  result: OcrResult;
  documentId: string;
  currencyCode: string;
  /** Carte de la photo, en tête de la carte du formulaire. */
  fileCard: ReactNode;
  onLeave: () => void;
  onSaved: () => void;
}

/**
 * Lignes lues sur la facture, à vérifier et associer. Rien n'est ajouté au stock avant la
 * validation ; une association faite à la main est mémorisée pour ce fournisseur.
 */
export function InvoiceEntryReview({ result, documentId, currencyCode, fileCard, onLeave, onSaved }: InvoiceEntryReviewProps) {
  const t = useTranslations('stock.entry');
  const ti = useTranslations('stock.invoice');
  const tc = useTranslations('stock.common');
  const f = useStockFormat();
  const entry = useStockEntry();
  const defaults = useMemo(() => invoiceDefaults(result), [result]);
  const candidates = useMemo(() => invoiceCandidates(result), [result]);
  const { form, lines, totals } = useStockEntryForm(defaults);
  const [supplierOpen, setSupplierOpen] = useState(false);
  // Une facture lue et non enregistrée est un travail en cours : quitter demande confirmation.
  const cancel = useFormLeave(!entry.isPending && !entry.isSuccess, onLeave);
  const units = { units: totals.units, unitsLabel: f.quantity(totals.units) };

  const submit = form.handleSubmit((values) => entry.mutate(entryPayload(values, documentId), {
    onSuccess: () => { notify.success(ti('success', { count: totals.count, ...units })); onSaved(); },
    onError: (e) => notify.error(e instanceof ApiError && e.status === 409 ? ti('already_recorded') : tc('save_error')),
  }));

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FormCard>
        {fileCard}
        <div>
          <InvoiceReviewAlert unassociated={totals.unassociated} />
          <StockEntryLines form={form} lines={lines} currencyCode={currencyCode} candidates={candidates} />
          <StockEntryFooter totals={totals} currencyCode={currencyCode} invoice />
        </div>
        <StockEntrySupplierSection form={form} open={supplierOpen} onToggle={() => setSupplierOpen((o) => !o)} />
      </FormCard>
      <FormActions dirty submitting={entry.isPending} note={ti('note')} onCancel={cancel}
        submitDisabled={totals.unassociated > 0 || totals.count === 0}
        submitLabel={totals.unassociated > 0 ? ti('associate_to_continue', { count: totals.unassociated }) : t('submit', units)} />
    </form>
  );
}
