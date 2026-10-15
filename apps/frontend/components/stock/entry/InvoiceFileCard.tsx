'use client';

import { CheckCircle2, Camera, FileText, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { InvoicePhotoInput } from './InvoicePhotoInput';
import type { InvoiceStage } from './useInvoiceUpload';

interface InvoiceFileCardProps {
  /** `url` : aperçu local d'une photo, `null` pour un PDF (icône à la place). */
  photo: { name: string; url: string | null };
  stage: Exclude<InvoiceStage, 'empty'>;
  /** « Lin & Co, facture F-2026-118 du 8 oct. 2026, 3 lignes lues » une fois la facture lue. */
  summary: string | null;
  problem: string | null;
  onFile: (file: File) => void;
}

const STATUS_TONE: Record<InvoiceFileCardProps['stage'], string> = {
  uploading: 'text-muted-foreground', reading: 'text-muted-foreground', done: 'text-green-700 dark:text-green-400',
  validated: 'text-amber-700 dark:text-amber-400', failed: 'text-red-700 dark:text-red-400',
};

/** Photo ou PDF envoyé : aperçu, nom, ce qui a été lu, état de la lecture et « Changer de facture ». */
export function InvoiceFileCard({ photo, stage, summary, problem, onFile }: InvoiceFileCardProps) {
  const t = useTranslations('stock.invoice');
  const busy = stage === 'uploading' || stage === 'reading';
  const Icon = busy ? Loader2 : stage === 'done' ? CheckCircle2 : TriangleAlert;

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-4 lg:px-4.5">
      {photo.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), hors optimisation d'images
        <img src={photo.url} alt="" className="h-23 w-18 shrink-0 rounded-xl border border-border bg-muted object-cover" />
      ) : (
        <span aria-hidden className="grid h-23 w-18 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
          <FileText size={26} strokeWidth={1.5} />
        </span>
      )}
      <div className="min-w-50 flex-1">
        <p dir="auto" className="truncate text-[0.9375rem] font-semibold text-foreground">{photo.name}</p>
        {summary && <p dir="auto" className="mt-1 text-[0.8125rem] text-muted-foreground">{summary}</p>}
        <p role="status" className={cn('mt-1.5 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold', STATUS_TONE[stage])}>
          <Icon size={15} aria-hidden className={busy ? 'animate-spin' : undefined} />
          {t(`stage.${stage}`)}
        </p>
        {problem && <p role="alert" className="mt-1 text-[0.8125rem] text-red-700 dark:text-red-400">{problem}</p>}
      </div>
      <InvoicePhotoInput onFile={onFile} disabled={busy}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
        <Camera size={16} aria-hidden />{t('change_file')}
      </InvoicePhotoInput>
    </div>
  );
}
