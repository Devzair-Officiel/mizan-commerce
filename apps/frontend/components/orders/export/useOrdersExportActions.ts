'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  exportErrorKind, ordersCsvUrl, useOrdersPdfExport, useOrdersWhatsAppExport, type OrdersExportFormat,
} from '@/lib/hooks/useOrderExports';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { notify } from '@/lib/notify';

/** Étape du pied : préparer (requête), puis partager ou ouvrir WhatsApp avec le résultat prêt. */
export type ExportStep = 'download_csv' | 'download_pdf' | 'prepare_pdf' | 'share_pdf' | 'prepare_message' | 'open_whatsapp';

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

interface ExportActionsOptions {
  format: OrdersExportFormat;
  query: string;
  onDone: () => void;
}

/**
 * Actions de l'export. CSV : lien direct. PDF : téléchargé (desktop, navigateur sans partage de
 * fichiers) ou, sur mobile, préparé puis partagé. WhatsApp : texte préparé, puis wa.me ou copie.
 * Le résultat préparé est attaché à ses paramètres : changer de format ou de période l'ignore.
 */
export function useOrdersExportActions({ format, query, onDone }: ExportActionsOptions) {
  const t = useTranslations('orders.export');
  const lang = useLocale();
  const [shareFiles] = useState(canShareFiles);
  const sharePdf = useIsDesktop() === false && shareFiles;
  const key = `${format}?${query}`;
  const [pdf, setPdf] = useState<{ key: string; file: File } | null>(null);
  const [message, setMessage] = useState<{ key: string; text: string } | null>(null);
  const pdfExport = useOrdersPdfExport();
  const whatsapp = useOrdersWhatsAppExport();
  const onError = (error: unknown) => notify.error(t(`errors.${exportErrorKind(error)}`));
  const file = pdf?.key === key ? pdf.file : null;
  const text = message?.key === key ? message.text : null;

  const step: ExportStep = format === 'csv' ? 'download_csv'
    : format === 'pdf' ? (!sharePdf ? 'download_pdf' : file ? 'share_pdf' : 'prepare_pdf')
      : text === null ? 'prepare_message' : 'open_whatsapp';

  /** Étapes qui appellent le serveur (après validation du formulaire). */
  function run(): void {
    if (step === 'download_csv') {
      saveFile(ordersCsvUrl(query, lang));
      onDone();
    } else if (step === 'download_pdf' || step === 'prepare_pdf') {
      pdfExport.mutate({ query, lang }, {
        onError,
        onSuccess: (ready) => {
          if (step === 'prepare_pdf') {
            setPdf({ key, file: ready });
          } else {
            saveBlob(ready);
            onDone();
          }
        },
      });
    } else if (step === 'prepare_message') {
      whatsapp.mutate({ query, lang }, { onError, onSuccess: (data) => setMessage({ key, text: data.text }) });
    }
  }

  // Partage et WhatsApp s'ouvrent dans le geste (après un await, le navigateur mobile les bloque).
  async function share(): Promise<void> {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: file.name });
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

  return { step, text, pending: pdfExport.isPending || whatsapp.isPending, run, share, openWhatsApp, copy };
}

export type OrdersExportActions = ReturnType<typeof useOrdersExportActions>;
