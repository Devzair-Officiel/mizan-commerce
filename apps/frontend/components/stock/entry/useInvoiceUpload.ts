'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOcrResult, useUploadInvoice, type OcrResult } from '@/lib/hooks/useOcr';
import { INVOICE_MAX_MB, INVOICE_PDF_MAX_PAGES, invoiceFileProblem, isInvoiceRefusal, isPdf, type InvoiceRefusal } from './invoiceFile';

/** Étape de la facture : aucun fichier, envoi, lecture, lue, déjà enregistrée ou échec. */
export type InvoiceStage = 'empty' | 'uploading' | 'reading' | 'done' | 'validated' | 'failed';

interface InvoicePhoto {
  name: string;
  /** Aperçu local d'une photo (URL `blob:`), libéré au changement de facture ; `null` pour un PDF. */
  url: string | null;
}

function stageOf(photo: InvoicePhoto | null, uploading: boolean, failed: boolean, result: OcrResult | undefined): InvoiceStage {
  if (!photo) return 'empty';
  if (failed) return 'failed';
  if (uploading) return 'uploading';
  if (!result || result.status === 'pending' || result.status === 'processing') return 'reading';
  return result.status;
}

/** Code du refus d'un document par le serveur (réponse 400), `null` pour une autre erreur. */
function refusalOf(data: unknown): InvoiceRefusal | null {
  const code = typeof data === 'object' && data !== null ? (data as { code?: unknown }).code : undefined;
  return isInvoiceRefusal(code) ? code : null;
}

/**
 * Envoi de la photo ou du PDF d'une facture puis lecture (le serveur lit et associe les lignes).
 * Le fichier est vérifié avant l'envoi (format, taille) ; le serveur reste seul juge.
 */
export function useInvoiceUpload() {
  const t = useTranslations('stock.invoice');
  const upload = useUploadInvoice();
  const [photo, setPhoto] = useState<InvoicePhoto | null>(null);
  const [ids, setIds] = useState<{ document: string; result: string } | null>(null);
  /** Photo refusée avant l'envoi : la facture déjà lue reste affichée. */
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  /** Envoi échoué : `true`, ou le code du refus du serveur (PDF protégé, trop de pages…). */
  const [uploadFailed, setUploadFailed] = useState<InvoiceRefusal | boolean>(false);
  const { data: result } = useOcrResult(ids?.result);

  useEffect(() => () => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
  }, [photo]);

  function send(file: File) {
    const issue = invoiceFileProblem(file);
    if (issue) {
      setFileProblem(issue === 'type' ? t('file_type') : t('file_size', { max: INVOICE_MAX_MB }));
      return;
    }
    setFileProblem(null);
    setUploadFailed(false);
    setIds(null);
    setPhoto({ name: file.name, url: isPdf(file) ? null : URL.createObjectURL(file) });
    upload.mutate(file, {
      onSuccess: (r) => setIds({ document: r.document_id, result: r.ocr_result_id }),
      onError: (err) => setUploadFailed(refusalOf(err.data) ?? true),
    });
  }

  const stage = stageOf(photo, upload.isPending, uploadFailed !== false, result);
  const failure = uploadFailed === true ? t('upload_failed')
    : uploadFailed ? t(`refused.${uploadFailed}`, { max: INVOICE_MAX_MB, pages: INVOICE_PDF_MAX_PAGES })
    : t('read_failed');
  return {
    photo, stage, send,
    problem: fileProblem ?? (stage === 'failed' ? failure : null),
    result: stage === 'done' ? result : undefined,
    documentId: ids?.document ?? null,
  };
}
