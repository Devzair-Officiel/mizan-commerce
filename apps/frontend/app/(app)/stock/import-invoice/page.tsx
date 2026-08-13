'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Camera, ChevronRight, FileText, Loader2, Sparkles,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { MatchingCandidatesSheet } from '@/components/ocr/MatchingCandidatesSheet';
import { useOcrResult, useUploadInvoice } from '@/lib/hooks/useOcr';
import type {
  OcrInvoiceLine, OcrMatching, OcrMatchingCandidate, OcrResult,
} from '@/lib/hooks/useOcr';
import {
  bestCandidateForLine, buildReviewDraft, buildReviewPayload,
  candidatesForLine, computeLineOcrConfidence,
  type ReviewedInvoiceLine,
} from '@/lib/ocr/review';

// Uniquement JPEG / PNG / WebP — le backend reste source de vérité (MIME + signature + taille).
const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp';

export default function ImportInvoicePage() {
  const t = useTranslations('stock.importInvoice');
  const [file, setFile] = useState<File | null>(null);
  const [ocrResultId, setOcrResultId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const upload = useUploadInvoice();

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError('');
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    try {
      const res = await upload.mutateAsync(picked);
      setOcrResultId(res.ocr_result_id);
    } catch (err) {
      setUploadError(err instanceof Error && err.message ? err.message : t('upload_error'));
      setFile(null);
    }
  }

  function handleReset() {
    setFile(null);
    setOcrResultId(null);
    setUploadError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <>
      <TopBar title={t('title')} back />
      <div className="flex flex-col gap-4 p-4 pb-32">
        {!ocrResultId && (
          <FilePickerCard
            inputRef={inputRef}
            uploading={upload.isPending}
            onFileChange={handleFileChange}
            error={uploadError}
            fileName={file?.name ?? null}
          />
        )}

        {ocrResultId && (
          <OcrResultView ocrResultId={ocrResultId} onReset={handleReset} />
        )}
      </div>
    </>
  );
}

// ── Sélection fichier ──────────────────────────────────────────────────────

interface FilePickerCardProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  fileName: string | null;
  error: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function FilePickerCard({ inputRef, uploading, fileName, error, onFileChange }: FilePickerCardProps) {
  const t = useTranslations('stock.importInvoice');
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Camera size={26} />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">{t('picker_title')}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{t('picker_helper')}</p>
      </div>

      <label className={`w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground px-4 min-h-12 font-semibold text-sm active:scale-[0.98] transition-transform ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
        {uploading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {t('uploading')}
          </>
        ) : (
          <>
            <Camera size={16} />
            {t('pick_cta')}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME}
          capture="environment"
          onChange={onFileChange}
          disabled={uploading}
          className="sr-only"
        />
      </label>

      {fileName && !uploading && !error && (
        <p className="text-xs text-muted-foreground truncate max-w-full">{fileName}</p>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}

// ── Container principal (query + branchement selon status) ────────────────

function OcrResultView({ ocrResultId, onReset }: { ocrResultId: string; onReset: () => void }) {
  const t = useTranslations('stock.importInvoice');
  const { data, error, isLoading } = useOcrResult(ocrResultId);

  if (isLoading && !data) return <AnalyzingCard label={t('loading')} />;

  if (error) {
    return (
      <ErrorCard
        title={t('error_network_title')}
        body={t('error_network_body')}
        onReset={onReset}
      />
    );
  }

  if (!data) return null;

  if (data.status === 'pending' || data.status === 'processing') {
    return <AnalyzingCard label={t('analyzing')} />;
  }

  if (data.status === 'failed') {
    return <FailedCard result={data} onReset={onReset} />;
  }

  // status === 'done' ou 'validated'
  if (!data.invoice) {
    return <FailedCard result={data} onReset={onReset} />;
  }

  return <ReviewView result={data} invoice={data.invoice} matching={data.matching} onReset={onReset} />;
}

// ── États d'analyse ────────────────────────────────────────────────────────

function AnalyzingCard({ label }: { label: string }) {
  const t = useTranslations('stock.importInvoice');
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col items-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles size={22} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('analyzing_sub')}</p>
      </div>
      <div className="w-full flex flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${100 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
}

function ErrorCard({ title, body, onReset }: { title: string; body: string; onReset: () => void }) {
  const t = useTranslations('stock.importInvoice');
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 flex flex-col items-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle size={20} />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{body}</p>
      <button onClick={onReset} className="text-xs font-medium text-primary underline mt-1">
        {t('restart')}
      </button>
    </div>
  );
}

function FailedCard({ result, onReset }: { result: OcrResult; onReset: () => void }) {
  const t = useTranslations('stock.importInvoice');
  const hasRaw = result.raw_text.trim().length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <AlertTriangle size={20} />
        </div>
        <p className="text-sm font-semibold text-foreground">{t('failed_title')}</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          {hasRaw ? t('failed_with_raw') : t('failed_without_raw')}
        </p>
        <button onClick={onReset} className="text-xs font-medium text-primary underline mt-1">
          {t('retry_photo')}
        </button>
      </div>

      {hasRaw && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={14} className="text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('raw_text_label')}
            </p>
          </div>
          <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {result.raw_text}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Revue facture ──────────────────────────────────────────────────────────

interface ReviewViewProps {
  result: OcrResult;
  invoice: NonNullable<OcrResult['invoice']>;
  matching: OcrMatching | null;
  onReset: () => void;
}

function ReviewView({ result, invoice, matching, onReset }: ReviewViewProps) {
  const t = useTranslations('stock.importInvoice');
  const [draft, setDraft] = useState<ReviewedInvoiceLine[]>(() => buildReviewDraft(invoice));
  const [sheetLineIndex, setSheetLineIndex] = useState<number | null>(null);

  // Refetch après polling : si le contrat d'invoice change (rare), on ré-initialise.
  const invoiceRef = useRef(invoice);
  useEffect(() => {
    if (invoiceRef.current !== invoice) {
      invoiceRef.current = invoice;
      setDraft(buildReviewDraft(invoice));
    }
  }, [invoice]);

  const matchingUnavailable = matching?.status === 'failed';

  function updateLine(index: number, patch: Partial<ReviewedInvoiceLine>) {
    setDraft((prev) => prev.map((l) => (l.invoiceLineIndex === index ? { ...l, ...patch } : l)));
  }

  const sheetCandidates: readonly OcrMatchingCandidate[] = useMemo(
    () => (sheetLineIndex !== null ? candidatesForLine(matching, sheetLineIndex) : []),
    [matching, sheetLineIndex],
  );
  const sheetDraftLine = sheetLineIndex !== null
    ? draft.find((l) => l.invoiceLineIndex === sheetLineIndex) ?? null
    : null;

  const missingSelection = draft.filter((l) => l.selectedVariantId === null).length;
  const readyForReview = draft.length > 0 && missingSelection === 0;
  const summary = readyForReview
    ? t('ready_summary', { count: draft.length })
    : t('missing_summary', { count: missingSelection });

  return (
    <div className="flex flex-col gap-4">
      <InvoiceSummaryCard invoice={invoice} confidenceScore={result.confidence_score} />

      {matchingUnavailable && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
          {t('matching_unavailable')}
        </p>
      )}

      <div className="rounded-2xl border border-border bg-card">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t('lines_title')}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{invoice.lines.length}</span>
        </div>
        <ul className="divide-y divide-border">
          {invoice.lines.map((invoiceLine, index) => {
            const draftLine = draft[index];
            if (!draftLine) return null;
            return (
              <InvoiceLineRow
                key={index}
                index={index}
                invoiceLine={invoiceLine}
                draftLine={draftLine}
                ocrLines={result.lines}
                matching={matching}
                currency={invoice.currency}
                onChange={(patch) => updateLine(index, patch)}
                onOpenMatch={() => setSheetLineIndex(index)}
              />
            );
          })}
        </ul>
      </div>

      <button onClick={onReset} className="text-xs text-muted-foreground underline py-2 text-center">
        {t('restart_other_photo')}
      </button>

      <ContinueBar
        disabled
        summary={summary}
        payloadPreview={() => buildReviewPayload(invoice, draft)}
      />

      <MatchingCandidatesSheet
        open={sheetLineIndex !== null}
        onClose={() => setSheetLineIndex(null)}
        candidates={sheetCandidates}
        selectedVariantId={sheetDraftLine?.selectedVariantId ?? null}
        onSelect={(variantId) => {
          if (sheetLineIndex !== null) updateLine(sheetLineIndex, { selectedVariantId: variantId });
        }}
        invoiceDescription={sheetDraftLine?.description ?? ''}
      />
    </div>
  );
}

// ── Résumé facture ─────────────────────────────────────────────────────────

function InvoiceSummaryCard({
  invoice, confidenceScore,
}: { invoice: NonNullable<OcrResult['invoice']>; confidenceScore: string | null }) {
  const t = useTranslations('stock.importInvoice');
  const confidencePct = confidenceScore != null ? Math.round(parseFloat(confidenceScore) * 100) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('supplier')}</p>
          <p className="text-sm font-semibold text-foreground truncate">
            {invoice.supplier_name || '—'}
          </p>
        </div>
        {confidencePct !== null && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {t('ocr_confidence_short', { pct: confidencePct })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetaCell label={t('invoice_number')} value={invoice.invoice_number} />
        <MetaCell label={t('invoice_date')} value={invoice.invoice_date} />
        <MetaCell
          label={t('total')}
          value={invoice.total ? `${invoice.total}${invoice.currency ? ` ${invoice.currency}` : ''}` : null}
          tabular
        />
        <MetaCell label={t('currency')} value={invoice.currency} />
      </div>
    </div>
  );
}

function MetaCell({ label, value, tabular }: { label: string; value: string | null; tabular?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium text-foreground truncate ${tabular ? 'tabular-nums' : ''}`}>
        {value || '—'}
      </p>
    </div>
  );
}

// ── Ligne facture ──────────────────────────────────────────────────────────

interface InvoiceLineRowProps {
  index: number;
  invoiceLine: OcrInvoiceLine;
  draftLine: ReviewedInvoiceLine;
  ocrLines: OcrResult['lines'];
  matching: OcrMatching | null;
  currency: string | null;
  onChange: (patch: Partial<ReviewedInvoiceLine>) => void;
  onOpenMatch: () => void;
}

function InvoiceLineRow({
  index, invoiceLine, draftLine, ocrLines, matching, currency, onChange, onOpenMatch,
}: InvoiceLineRowProps) {
  const t = useTranslations('stock.importInvoice');
  const tMatch = useTranslations('stock.matchKind');
  const ocrConfidence = computeLineOcrConfidence(invoiceLine.source_line_indices, ocrLines);
  const ocrConfidencePct = ocrConfidence !== null ? Math.round(ocrConfidence * 100) : null;

  const bestCandidate = bestCandidateForLine(matching, index);
  const selectedCandidate = draftLine.selectedVariantId
    ? candidatesForLine(matching, index).find((c) => c.variant_id === draftLine.selectedVariantId) ?? null
    : null;
  const candidateToDisplay = selectedCandidate ?? bestCandidate;
  const hasCandidates = candidatesForLine(matching, index).length > 0;
  const isConfirmed = draftLine.selectedVariantId !== null;

  return (
    <li className="px-4 py-3 flex flex-col gap-3">
      <FloatingInput
        id={`desc-${index}`}
        label={t('field_description')}
        value={draftLine.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />

      <div className="grid grid-cols-3 gap-2">
        <FloatingInput
          id={`qty-${index}`}
          label={t('field_quantity')}
          value={draftLine.quantity ?? ''}
          onChange={(e) => onChange({ quantity: e.target.value || null })}
          inputMode="decimal"
        />
        <FloatingInput
          id={`unit-${index}`}
          label={currency ? t('field_unit_price_with', { currency }) : t('field_unit_price')}
          value={draftLine.unitPrice ?? ''}
          onChange={(e) => onChange({ unitPrice: e.target.value || null })}
          inputMode="decimal"
        />
        <FloatingInput
          id={`total-${index}`}
          label={currency ? t('field_line_total_with', { currency }) : t('field_line_total')}
          value={draftLine.lineTotal ?? ''}
          onChange={(e) => onChange({ lineTotal: e.target.value || null })}
          inputMode="decimal"
        />
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {invoiceLine.supplier_reference && (
          <span className="truncate">{t('supplier_ref_prefix')} {invoiceLine.supplier_reference}</span>
        )}
        {ocrConfidencePct !== null && (
          <span className="tabular-nums ms-auto">
            {t('ocr_confidence_short', { pct: ocrConfidencePct })}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenMatch}
        className={`w-full text-start rounded-xl border px-3 py-2 flex items-start gap-2 min-h-13 active:scale-[0.98] transition-transform ${
          isConfirmed
            ? 'border-primary/40 bg-primary/5'
            : 'border-border bg-muted/30'
        }`}
      >
        <div className="flex-1 min-w-0">
          {!hasCandidates ? (
            <p className="text-xs font-medium text-muted-foreground">{t('no_candidate')}</p>
          ) : candidateToDisplay ? (
            <>
              <p className="text-sm font-semibold text-foreground truncate">
                {candidateToDisplay.product_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {candidateToDisplay.packaging_name && <>{candidateToDisplay.packaging_name} · </>}
                {tMatch(candidateToDisplay.match_kind)}
                {!isConfirmed && ` · ${t('proposal_suffix')}`}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t('no_candidate')}</p>
          )}
        </div>
        <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1 rtl:rotate-180" />
      </button>
    </li>
  );
}

// ── Bouton principal sticky (Step 8 : pas d'appel backend) ────────────────

interface ContinueBarProps {
  disabled: boolean;
  summary: string;
  /** Fonction pure — utilisée uniquement par Step 9. Non appelée ici. */
  payloadPreview: () => object;
}

function ContinueBar({ disabled, summary, payloadPreview }: ContinueBarProps) {
  const t = useTranslations('stock.importInvoice');
  // NOTE Step 8 : aucune requête backend n'est déclenchée. Le bouton reste
  // désactivé volontairement — la validation humaine sera câblée en Step 9.
  void payloadPreview;
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-md p-3 pb-safe"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="max-w-md mx-auto flex flex-col gap-1.5">
        <p className="text-[11px] text-muted-foreground text-center">{summary}</p>
        <Button disabled={disabled} className="w-full min-h-12">
          {t('continue_pending')}
        </Button>
      </div>
    </div>
  );
}
