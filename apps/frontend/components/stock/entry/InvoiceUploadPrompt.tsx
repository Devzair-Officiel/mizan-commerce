'use client';

import { Camera, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { INVOICE_MAX_MB } from './invoiceFile';
import { InvoicePhotoInput } from './InvoicePhotoInput';

interface InvoiceUploadPromptProps {
  problem: string | null;
  onFile: (file: File) => void;
}

/** Avant l'envoi : ce qui va se passer, et le bouton qui ouvre l'appareil photo ou les fichiers. */
export function InvoiceUploadPrompt({ problem, onFile }: InvoiceUploadPromptProps) {
  const t = useTranslations('stock.invoice');
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted text-foreground" aria-hidden>
        <FileText size={22} strokeWidth={1.75} />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-[0.9375rem] font-semibold text-foreground">{t('prompt_title')}</p>
        <p className="text-sm text-muted-foreground">{t('prompt_help', { max: INVOICE_MAX_MB })}</p>
      </div>
      <InvoicePhotoInput onFile={onFile}
        className="mt-1 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
        <Camera size={17} aria-hidden />{t('prompt_cta')}
      </InvoicePhotoInput>
      {problem && <p role="alert" className="text-[0.8125rem] text-red-700 dark:text-red-400">{problem}</p>}
    </div>
  );
}
