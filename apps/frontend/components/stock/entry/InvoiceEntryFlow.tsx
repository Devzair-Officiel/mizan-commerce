'use client';

import { useTranslations } from 'next-intl';
import { FormCard } from '@/components/form/FormCard';
import { InvoiceEntryReview } from './InvoiceEntryReview';
import { InvoiceFileCard } from './InvoiceFileCard';
import { InvoiceUploadPrompt } from './InvoiceUploadPrompt';
import { useInvoiceSummary } from './useInvoiceSummary';
import { useInvoiceUpload } from './useInvoiceUpload';

interface InvoiceEntryFlowProps {
  currencyCode: string;
  onLeave: () => void;
  onSaved: () => void;
}

/** Depuis une facture : envoi de la photo, lecture, puis lignes à vérifier et associer. */
export function InvoiceEntryFlow({ currencyCode, onLeave, onSaved }: InvoiceEntryFlowProps) {
  const t = useTranslations('stock.invoice');
  const upload = useInvoiceUpload();
  const summary = useInvoiceSummary(upload.result);

  if (upload.stage === 'empty' || !upload.photo) {
    return <FormCard><InvoiceUploadPrompt problem={upload.problem} onFile={upload.send} /></FormCard>;
  }
  const fileCard = <InvoiceFileCard photo={upload.photo} stage={upload.stage} summary={summary} problem={upload.problem} onFile={upload.send} />;
  const { result, documentId } = upload;
  if (result && documentId && (result.invoice?.lines.length ?? 0) > 0) {
    return <InvoiceEntryReview key={documentId} result={result} documentId={documentId} currencyCode={currencyCode}
      fileCard={fileCard} onLeave={onLeave} onSaved={onSaved} />;
  }
  return (
    <FormCard>
      {fileCard}
      {result && <p className="px-4 py-4 text-sm text-muted-foreground lg:px-4.5">{t('no_lines')}</p>}
    </FormCard>
  );
}
