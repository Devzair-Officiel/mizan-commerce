'use client';

import { useTranslations } from 'next-intl';
import { FileText, TriangleAlert } from 'lucide-react';
import type { ExportFormat, ExportKind, ExportSummary } from '@/lib/hooks/useExports';

interface ExportRowsBoxProps {
  kind: ExportKind;
  format: ExportFormat;
  summary?: ExportSummary;
  /** Message WhatsApp préparé : il remplace le nombre de lignes. */
  preview: string | null;
  onUseCsv: () => void;
}

/** Nombre de lignes exportées, plafond du PDF (avec le passage au CSV) ou aperçu du message. */
export function ExportRowsBox({ kind, format, summary, preview, onUseCsv }: ExportRowsBoxProps) {
  const t = useTranslations('export');
  if (preview !== null) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-foreground">{t('preview_label')}</span>
        <p tabIndex={0} aria-label={t('preview_label')} dir="auto"
          className="max-h-40 overflow-y-auto rounded-xl bg-muted px-3.5 py-3 text-[0.8125rem] whitespace-pre-wrap text-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/30">
          {preview}
        </p>
      </div>
    );
  }
  if (format === 'pdf' && summary && summary.rows > summary.pdf_max_rows) {
    return (
      <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-amber-400/15 px-3.5 py-3 text-[0.8125rem] text-amber-700 dark:text-amber-300">
        <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
        <div className="flex flex-col items-start gap-1">
          <p>{t('pdf_limit', { kind, count: summary.rows, max: summary.pdf_max_rows })}</p>
          <button type="button" onClick={onUseCsv}
            className="min-h-8 font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-primary/30">
            {t('use_csv')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted px-3.5 py-2.5 text-[0.8125rem] text-foreground">
      <FileText size={18} aria-hidden className="shrink-0 text-muted-foreground" />
      <p aria-live="polite">{summary ? t('rows', { kind, format, count: summary.rows }) : ' '}</p>
    </div>
  );
}
