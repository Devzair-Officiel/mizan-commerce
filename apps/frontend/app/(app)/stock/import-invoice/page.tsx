'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Camera, CheckCircle2, ChevronRight, EyeOff, FileText,
  Loader2, Sparkles,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FloatingInput } from '@/components/ui/floating-fields';
import {
  MatchingCandidatesSheet,
  type MatchingCandidateSelection,
} from '@/components/ocr/MatchingCandidatesSheet';
import {
  OcrCatalogVariantSheet,
  type OcrCatalogVariantPick,
} from '@/components/ocr/OcrCatalogVariantSheet';
import {
  useOcrResult, useUploadInvoice, useValidateOcrReview,
} from '@/lib/hooks/useOcr';
import type {
  OcrInvoiceLine, OcrMatching, OcrMatchingCandidate, OcrResult, OcrReview,
} from '@/lib/hooks/useOcr';
import { ApiError } from '@/lib/api-client';
import {
  bestCandidateForLine, buildReviewDraft, buildReviewPayload,
  candidatesForLine, computeLineOcrConfidence, countDecisions,
  isDraftReady, isStockLineReady,
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

  if (!data.invoice) {
    return <FailedCard result={data} onReset={onReset} />;
  }

  if (data.status === 'validated' && data.review) {
    return (
      <ValidatedView result={data} invoice={data.invoice} review={data.review} onReset={onReset} />
    );
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
  const [candidatesSheetIndex, setCandidatesSheetIndex] = useState<number | null>(null);
  const [catalogSheetIndex, setCatalogSheetIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const validate = useValidateOcrReview(result.ocr_result_id);

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

  function handlePickCandidate(index: number, selection: MatchingCandidateSelection) {
    updateLine(index, {
      decision: 'stock',
      selectedVariantId: selection.variantId,
      selectedProductName: selection.productName,
      selectedPackagingName: selection.packagingName,
    });
  }

  function handleCatalogPick(index: number, pick: OcrCatalogVariantPick) {
    updateLine(index, {
      decision: 'stock',
      selectedVariantId: pick.variantId,
      selectedProductName: pick.productName,
      selectedPackagingName: pick.packagingName,
    });
    setCatalogSheetIndex(null);
  }

  function handleIgnoreLine(index: number) {
    updateLine(index, {
      decision: 'ignore',
      selectedVariantId: null,
      selectedProductName: null,
      selectedPackagingName: null,
    });
  }

  function handleResetLine(index: number) {
    updateLine(index, {
      decision: null,
      selectedVariantId: null,
      selectedProductName: null,
      selectedPackagingName: null,
    });
  }

  const sheetCandidates: readonly OcrMatchingCandidate[] = useMemo(
    () =>
      candidatesSheetIndex !== null
        ? candidatesForLine(matching, candidatesSheetIndex)
        : [],
    [matching, candidatesSheetIndex],
  );
  const activeIndex = candidatesSheetIndex ?? catalogSheetIndex;
  const activeDraftLine = activeIndex !== null
    ? draft.find((l) => l.invoiceLineIndex === activeIndex) ?? null
    : null;

  const counts = countDecisions(draft);
  const ready = isDraftReady(draft);
  const summary = counts.pending === 0
    ? t('ready_summary', { count: counts.stock, ignored: counts.ignore })
    : t('missing_summary', { count: counts.pending });

  async function handleConfirm() {
    setSubmitError('');
    try {
      await validate.mutateAsync(buildReviewPayload(draft));
      setConfirmOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError(t('error_conflict'));
      } else if (err instanceof ApiError && err.status === 400) {
        setSubmitError(t('error_payload'));
      } else {
        setSubmitError(t('error_generic'));
      }
    }
  }

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
                onOpenMatch={() => setCandidatesSheetIndex(index)}
                onOpenCatalog={() => setCatalogSheetIndex(index)}
                onIgnore={() => handleIgnoreLine(index)}
                onResetDecision={() => handleResetLine(index)}
              />
            );
          })}
        </ul>
      </div>

      <button onClick={onReset} className="text-xs text-muted-foreground underline py-2 text-center">
        {t('restart_other_photo')}
      </button>

      <ContinueBar
        disabled={!ready || validate.isPending}
        summary={summary}
        onClick={() => { setSubmitError(''); setConfirmOpen(true); }}
        loading={validate.isPending}
      />

      <MatchingCandidatesSheet
        open={candidatesSheetIndex !== null}
        onClose={() => setCandidatesSheetIndex(null)}
        candidates={sheetCandidates}
        selectedVariantId={activeDraftLine?.selectedVariantId ?? null}
        onPickCandidate={(sel) => {
          if (candidatesSheetIndex !== null) handlePickCandidate(candidatesSheetIndex, sel);
        }}
        onOpenCatalog={() => {
          if (candidatesSheetIndex !== null) setCatalogSheetIndex(candidatesSheetIndex);
        }}
        onIgnore={() => {
          if (candidatesSheetIndex !== null) handleIgnoreLine(candidatesSheetIndex);
        }}
        invoiceDescription={activeDraftLine?.description ?? ''}
      />

      <OcrCatalogVariantSheet
        open={catalogSheetIndex !== null}
        onClose={() => setCatalogSheetIndex(null)}
        invoiceDescription={activeDraftLine?.description ?? ''}
        onPick={(pick) => {
          if (catalogSheetIndex !== null) handleCatalogPick(catalogSheetIndex, pick);
        }}
      />

      <ConfirmValidateSheet
        open={confirmOpen}
        onClose={() => { if (!validate.isPending) setConfirmOpen(false); }}
        counts={counts}
        submitting={validate.isPending}
        error={submitError}
        onConfirm={handleConfirm}
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
  onOpenCatalog: () => void;
  onIgnore: () => void;
  onResetDecision: () => void;
}

function InvoiceLineRow({
  index, invoiceLine, draftLine, ocrLines, matching, currency,
  onChange, onOpenMatch, onOpenCatalog, onIgnore, onResetDecision,
}: InvoiceLineRowProps) {
  const t = useTranslations('stock.importInvoice');
  const tMatch = useTranslations('stock.matchKind');
  const ocrConfidence = computeLineOcrConfidence(invoiceLine.source_line_indices, ocrLines);
  const ocrConfidencePct = ocrConfidence !== null ? Math.round(ocrConfidence * 100) : null;

  const bestCandidate = bestCandidateForLine(matching, index);
  const selectedFromCandidates = draftLine.selectedVariantId
    ? candidatesForLine(matching, index).find((c) => c.variant_id === draftLine.selectedVariantId) ?? null
    : null;

  const isStock = draftLine.decision === 'stock';
  const isIgnored = draftLine.decision === 'ignore';
  const stockReady = isStock && isStockLineReady(draftLine);
  const stockIncomplete = isStock && !stockReady;

  return (
    <li className={`px-4 py-3 flex flex-col gap-3 ${isIgnored ? 'opacity-60' : ''}`}>
      <FloatingInput
        id={`desc-${index}`}
        label={t('field_description')}
        value={draftLine.description}
        onChange={(e) => onChange({ description: e.target.value })}
        disabled={isIgnored}
      />

      <div className="grid grid-cols-3 gap-2">
        <FloatingInput
          id={`qty-${index}`}
          label={t('field_quantity')}
          value={draftLine.quantity ?? ''}
          onChange={(e) => onChange({ quantity: e.target.value || null })}
          inputMode="decimal"
          disabled={isIgnored}
        />
        <FloatingInput
          id={`unit-${index}`}
          label={currency ? t('field_unit_price_with', { currency }) : t('field_unit_price')}
          value={draftLine.unitPrice ?? ''}
          onChange={(e) => onChange({ unitPrice: e.target.value || null })}
          inputMode="decimal"
          disabled={isIgnored}
        />
        <FloatingInput
          id={`total-${index}`}
          label={currency ? t('field_line_total_with', { currency }) : t('field_line_total')}
          value={draftLine.lineTotal ?? ''}
          onChange={(e) => onChange({ lineTotal: e.target.value || null })}
          inputMode="decimal"
          disabled={isIgnored}
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

      {isStock ? (
        <StockDecisionCard
          productName={draftLine.selectedProductName ?? selectedFromCandidates?.product_name ?? ''}
          packagingName={draftLine.selectedPackagingName ?? selectedFromCandidates?.packaging_name ?? ''}
          matchKind={selectedFromCandidates ? tMatch(selectedFromCandidates.match_kind) : null}
          incomplete={stockIncomplete}
          onChange={onOpenMatch}
          onReset={onResetDecision}
          missingLabel={t('missing_quantity')}
          changeLabel={t('change_choice')}
          resetLabel={t('reset_decision')}
        />
      ) : isIgnored ? (
        <IgnoredDecisionCard
          label={t('ignored_state')}
          resetLabel={t('reset_decision')}
          onReset={onResetDecision}
        />
      ) : (
        <PendingDecisionButton
          bestCandidate={bestCandidate}
          onOpen={onOpenMatch}
          onOpenCatalog={onOpenCatalog}
          onIgnore={onIgnore}
          proposalSuffix={t('proposal_suffix')}
          decidePrompt={t('decide_prompt')}
          noCandidateLabel={t('no_candidate')}
          matchKindLabel={bestCandidate ? tMatch(bestCandidate.match_kind) : ''}
        />
      )}
    </li>
  );
}

interface StockDecisionCardProps {
  productName: string;
  packagingName: string;
  matchKind: string | null;
  incomplete: boolean;
  onChange: () => void;
  onReset: () => void;
  missingLabel: string;
  changeLabel: string;
  resetLabel: string;
}

function StockDecisionCard({
  productName, packagingName, matchKind, incomplete,
  onChange, onReset, missingLabel, changeLabel, resetLabel,
}: StockDecisionCardProps) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${incomplete ? 'border-amber-400/60 bg-amber-500/5' : 'border-primary/40 bg-primary/5'}`}>
      <div className="flex items-start gap-2">
        <div className={`shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${incomplete ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-primary/15 text-primary'}`}>
          {incomplete ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{productName || '—'}</p>
          {packagingName && (
            <p className="text-xs text-muted-foreground truncate">{packagingName}</p>
          )}
          {matchKind && (
            <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{matchKind}</p>
          )}
          {incomplete && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{missingLabel}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={onChange}
          className="text-[11px] font-medium text-primary underline min-h-11 py-2"
        >
          {changeLabel}
        </button>
        <span className="text-[11px] text-muted-foreground/50">·</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-muted-foreground underline min-h-11 py-2"
        >
          {resetLabel}
        </button>
      </div>
    </div>
  );
}

function IgnoredDecisionCard({ label, resetLabel, onReset }: {
  label: string; resetLabel: string; onReset: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-2">
      <div className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <EyeOff size={13} />
      </div>
      <p className="flex-1 text-xs text-muted-foreground">{label}</p>
      <button
        type="button"
        onClick={onReset}
        className="text-[11px] text-muted-foreground underline min-h-11 py-2 px-1"
      >
        {resetLabel}
      </button>
    </div>
  );
}

interface PendingDecisionButtonProps {
  bestCandidate: OcrMatchingCandidate | null;
  onOpen: () => void;
  onOpenCatalog: () => void;
  onIgnore: () => void;
  proposalSuffix: string;
  decidePrompt: string;
  noCandidateLabel: string;
  matchKindLabel: string;
}

function PendingDecisionButton({
  bestCandidate, onOpen, onOpenCatalog, onIgnore,
  proposalSuffix, decidePrompt, noCandidateLabel, matchKindLabel,
}: PendingDecisionButtonProps) {
  const t = useTranslations('stock.importInvoice');
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-start rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 flex items-start gap-2 min-h-13 active:scale-[0.98] transition-transform"
      >
        <div className="flex-1 min-w-0">
          {bestCandidate ? (
            <>
              <p className="text-sm font-semibold text-foreground truncate">
                {bestCandidate.product_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {bestCandidate.packaging_name && <>{bestCandidate.packaging_name} · </>}
                {matchKindLabel} · {proposalSuffix}
              </p>
              <p className="text-[11px] text-primary mt-0.5">{decidePrompt}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-muted-foreground">{noCandidateLabel}</p>
              <p className="text-[11px] text-primary mt-0.5">{decidePrompt}</p>
            </>
          )}
        </div>
        <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1 rtl:rotate-180" />
      </button>

      <div className="flex items-center gap-3 justify-end">
        <button
          type="button"
          onClick={onOpenCatalog}
          className="text-[11px] text-primary underline min-h-11 py-2 px-1"
        >
          {t('quick_catalog')}
        </button>
        <span className="text-[11px] text-muted-foreground/50">·</span>
        <button
          type="button"
          onClick={onIgnore}
          className="text-[11px] text-muted-foreground underline min-h-11 py-2 px-1"
        >
          {t('quick_ignore')}
        </button>
      </div>
    </div>
  );
}

// ── Sticky continue ────────────────────────────────────────────────────────

interface ContinueBarProps {
  disabled: boolean;
  summary: string;
  onClick: () => void;
  loading: boolean;
}

function ContinueBar({ disabled, summary, onClick, loading }: ContinueBarProps) {
  const t = useTranslations('stock.importInvoice');
  return (
    <div
      className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-md p-3 pb-safe"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <div className="max-w-md mx-auto flex flex-col gap-1.5">
        <p className="text-[11px] text-muted-foreground text-center">{summary}</p>
        <Button
          disabled={disabled}
          onClick={onClick}
          className="w-full min-h-12"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin me-2" />
              {t('validating')}
            </>
          ) : (
            t('continue_cta')
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Confirmation sheet ─────────────────────────────────────────────────────

interface ConfirmValidateSheetProps {
  open: boolean;
  onClose: () => void;
  counts: ReturnType<typeof countDecisions>;
  submitting: boolean;
  error: string;
  onConfirm: () => void;
}

function ConfirmValidateSheet({
  open, onClose, counts, submitting, error, onConfirm,
}: ConfirmValidateSheetProps) {
  const t = useTranslations('stock.importInvoice');
  return (
    <BottomSheet open={open} onClose={onClose} title={t('confirm_title')}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground">{t('confirm_body')}</p>

        <div className="flex flex-col gap-2">
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary shrink-0">
              <CheckCircle2 size={16} />
            </div>
            <p className="text-sm text-foreground flex-1">
              {t('confirm_stock_count', { count: counts.stock })}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
              <EyeOff size={16} />
            </div>
            <p className="text-sm text-foreground flex-1">
              {t('confirm_ignore_count', { count: counts.ignore })}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t('confirm_no_stock_hint')}</p>

        {error && (
          <p className="text-xs text-destructive" role="alert">{error}</p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            onClick={onConfirm}
            disabled={submitting}
            className="w-full min-h-12"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin me-2" />
                {t('validating')}
              </>
            ) : (
              t('confirm_cta')
            )}
          </Button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs text-muted-foreground underline py-2 min-h-11 disabled:opacity-50"
          >
            {t('confirm_cancel')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Vue validée (status='validated', hydratée depuis review) ──────────────

interface ValidatedViewProps {
  result: OcrResult;
  invoice: NonNullable<OcrResult['invoice']>;
  review: OcrReview;
  onReset: () => void;
}

function ValidatedView({ result, invoice, review, onReset }: ValidatedViewProps) {
  const t = useTranslations('stock.importInvoice');
  const stockCount = review.lines.filter((l) => l.decision === 'stock').length;
  const ignoreCount = review.lines.filter((l) => l.decision === 'ignore').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CheckCircle2 size={22} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t('validated_title')}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {t('validated_body', { stock: stockCount, ignored: ignoreCount })}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground/80">
          {t('validated_no_stock_hint')}
        </p>
      </div>

      <InvoiceSummaryCard invoice={invoice} confidenceScore={result.confidence_score} />

      <div className="rounded-2xl border border-border bg-card">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t('validated_lines_title')}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{review.lines.length}</span>
        </div>
        <ul className="divide-y divide-border">
          {review.lines.map((line) => (
            <li key={line.invoice_line_index} className="px-4 py-3 flex items-start gap-3">
              <div className={`shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${
                line.decision === 'stock'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {line.decision === 'stock' ? <CheckCircle2 size={14} /> : <EyeOff size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{line.description}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                  {line.quantity && <span>{t('field_quantity')}: {line.quantity}</span>}
                  {line.line_total && (
                    <span>· {t('field_line_total')}: {line.line_total}{invoice.currency ? ` ${invoice.currency}` : ''}</span>
                  )}
                </div>
                <p className={`text-[11px] mt-0.5 ${line.decision === 'stock' ? 'text-primary' : 'text-muted-foreground'}`}>
                  {line.decision === 'stock' ? t('validated_line_stock') : t('validated_line_ignored')}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onReset}
        className="text-xs text-muted-foreground underline py-2 text-center"
      >
        {t('validated_restart')}
      </button>
    </div>
  );
}
