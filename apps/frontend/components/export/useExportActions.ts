'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  exportCsvUrl, exportErrorKind, usePdfExport, useWhatsAppExport, type ExportFormat, type ExportKind,
} from '@/lib/hooks/useExports';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { notify } from '@/lib/notify';

/**
 * Étape du pied : préparer (requête), puis partager ou ouvrir WhatsApp avec le résultat prêt.
 * `share_bundle` : message tronqué, le PDF complet partagé avec le texte du résumé (mobile).
 */
export type ExportStep =
  | 'download_csv' | 'download_pdf' | 'prepare_pdf' | 'share_pdf' | 'prepare_message' | 'open_whatsapp' | 'share_bundle';

/** Partage de fichiers (Web Share niveau 2) : mobiles surtout ; ailleurs, téléchargement. */
function canShareFiles(): boolean {
  const probe = new File([''], 'probe.pdf', { type: 'application/pdf' });
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
}

function saveFile(href: string, name = ''): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
}

function saveBlob(file: File): void {
  const url = URL.createObjectURL(file);
  saveFile(url, file.name);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/**
 * Remise du résultat prêt, dans le geste (après un await, le navigateur mobile la bloque) : partage
 * du PDF (avec `sharedText` : le résumé, repris ou ignoré selon le système et l'application choisie),
 * wa.me ou copie du message.
 */
function useHandoff(file: File | null, sharedText: string | null, text: string | null, onDone: () => void) {
  const t = useTranslations('export');

  async function share(): Promise<void> {
    if (!file) return;
    try {
      await navigator.share(sharedText === null
        ? { files: [file], title: file.name }
        : { files: [file], title: file.name, text: sharedText });
      onDone();
    } catch (error) {
      if (isAbort(error)) return;
      saveBlob(file);
      onDone();
    }
  }

  function openWhatsApp(): void {
    if (text === null) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    onDone();
  }

  async function copy(): Promise<void> {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      notify.success(t('copied'));
    } catch {
      notify.error(t('errors.copy'));
    }
  }

  return { share, openWhatsApp, copy };
}

interface ExportActionsOptions {
  kind: ExportKind;
  format: ExportFormat;
  query: string;
  onDone: () => void;
}

/**
 * Actions de l'export. CSV : lien direct. PDF : téléchargé (desktop, navigateur sans partage de
 * fichiers) ou, sur mobile, préparé puis partagé. WhatsApp : texte préparé, puis wa.me ou copie ;
 * message tronqué, sur mobile : PDF et texte préparés ensemble, puis partagés ensemble.
 * Le résultat préparé est attaché à ses paramètres : changer de période, de périmètre ou de filtre
 * l'ignore. Commun aux exports des commandes et du stock (`kind`).
 */
export function useExportActions({ kind, format, query, onDone }: ExportActionsOptions) {
  const t = useTranslations('export');
  const lang = useLocale();
  const [shareFiles] = useState(canShareFiles);
  const sharePdf = useIsDesktop() === false && shareFiles;
  const [pdf, setPdf] = useState<{ key: string; file: File } | null>(null);
  const [message, setMessage] = useState<{ key: string; text: string } | null>(null);
  const [bundle, setBundle] = useState<string | null>(null);
  const pdfExport = usePdfExport(kind);
  const whatsapp = useWhatsAppExport(kind);
  const onError = (error: unknown) => notify.error(t(`errors.${exportErrorKind(error)}`, { kind }));
  const file = pdf?.key === query ? pdf.file : null;
  const text = message?.key === query ? message.text : null;
  const bundled = bundle === query && file !== null && text !== null;

  const step: ExportStep = format === 'csv' ? 'download_csv'
    : format === 'pdf' ? (!sharePdf ? 'download_pdf' : file ? 'share_pdf' : 'prepare_pdf')
      : bundled ? 'share_bundle' : text === null ? 'prepare_message' : 'open_whatsapp';

  const keepPdf = (ready: File) => setPdf({ key: query, file: ready });

  function prepareMessage(): void {
    whatsapp.mutate({ query, lang }, { onError, onSuccess: (data) => setMessage({ key: query, text: data.text }) });
  }

  /** Étapes qui appellent le serveur (après validation du formulaire). */
  function run(): void {
    if (step === 'download_csv') {
      saveFile(exportCsvUrl(kind, query, lang));
      onDone();
    } else if (step === 'download_pdf' || step === 'prepare_pdf') {
      pdfExport.mutate({ query, lang }, {
        onError,
        onSuccess: (ready) => {
          if (step === 'prepare_pdf') {
            keepPdf(ready);
          } else {
            saveBlob(ready);
            onDone();
          }
        },
      });
    } else if (step === 'prepare_message') {
      prepareMessage();
    }
  }

  /** Message tronqué : prépare ce qui manque du PDF complet et du texte, partagés ensemble ensuite. */
  function prepareBundle(): void {
    setBundle(query);
    if (!file) pdfExport.mutate({ query, lang }, { onError, onSuccess: keepPdf });
    if (text === null) prepareMessage();
  }

  const handoff = useHandoff(file, step === 'share_bundle' ? text : null, text, onDone);
  const pending = pdfExport.isPending || whatsapp.isPending;
  return { step, text, pending, canShareBundle: sharePdf, run, prepareBundle, ...handoff };
}

export type ExportActions = ReturnType<typeof useExportActions>;
