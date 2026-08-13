/**
 * Client TanStack Query pour l'API OCR facture fournisseur (étapes 6-7).
 *
 * Endpoints backend :
 *   POST /ocr/invoices/              → upload multipart, retourne { ocr_result_id }
 *   GET  /ocr/results/<uuid>/        → détail avec status/lines/invoice/matching
 *
 * Le polling s'arrête automatiquement sur les statuts terminaux
 * (`done`, `failed`, `validated`) via `refetchInterval`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

// ── Statuts ────────────────────────────────────────────────────────────────
export type OcrStatus = 'pending' | 'processing' | 'done' | 'failed' | 'validated';
export type OcrMatchingStatus = 'done' | 'failed';
export type OcrMatchKind = 'barcode_exact' | 'sku_exact' | 'name_similarity';

// ── OCR brut ───────────────────────────────────────────────────────────────
export interface OcrLine {
  text: string;
  /** Confiance PaddleOCR entre 0 et 1 (pas une confiance IA de structuration). */
  confidence: number;
  bbox: number[];
}

// ── Facture structurée (contrat 6B) ────────────────────────────────────────
export interface OcrInvoiceLine {
  description: string;
  supplier_reference: string | null;
  /** Montants en STRING : suit le contrat backend (Decimal-safe). */
  quantity: string | null;
  unit_price: string | null;
  line_total: string | null;
  /** Indices dans `OcrResult.lines` qui ont servi à composer cette ligne. */
  source_line_indices: number[];
}

export interface OcrInvoice {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  subtotal: string | null;
  tax_amount: string | null;
  total: string | null;
  lines: OcrInvoiceLine[];
  warnings: string[];
}

// ── Matching déterministe (étape 7) ────────────────────────────────────────
export interface OcrMatchingCandidate {
  variant_id: string;
  product_id: string;
  product_name: string;
  packaging_name: string;
  match_kind: OcrMatchKind;
  /** Score algorithmique 0-100 — PAS une confiance IA. */
  similarity_score: number;
}

export interface OcrMatchingLine {
  invoice_line_index: number;
  candidates: OcrMatchingCandidate[];
}

export interface OcrMatching {
  status: OcrMatchingStatus;
  lines: OcrMatchingLine[];
}

// ── Revue humaine (Step 9) ─────────────────────────────────────────────────
export type OcrReviewDecision = 'stock' | 'ignore';

export interface OcrReviewLine {
  invoice_line_index: number;
  description: string;
  quantity: string | null;
  unit_price: string | null;
  line_total: string | null;
  decision: OcrReviewDecision;
  variant_id: string | null;
}

export interface OcrReview {
  schema_version: 1;
  lines: OcrReviewLine[];
}

// ── Résultat OCR complet ───────────────────────────────────────────────────
export interface OcrResult {
  ocr_result_id: string;
  document_id: string;
  status: OcrStatus;
  raw_text: string;
  /** Confiance OCR globale, `null` tant que le pipeline n'a pas abouti. */
  confidence_score: string | null;
  lines: OcrLine[];
  invoice: OcrInvoice | null;
  matching: OcrMatching | null;
  /** Présent uniquement après validation humaine (status === 'validated'). */
  review: OcrReview | null;
  validated_at: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
}

// ── Réponse upload ─────────────────────────────────────────────────────────
export interface OcrUploadResponse {
  document_id: string;
  ocr_result_id: string;
  status: OcrStatus;
  original_filename: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
}

const TERMINAL_STATUSES: ReadonlySet<OcrStatus> = new Set(['done', 'failed', 'validated']);

/**
 * Upload d'une facture (multipart). Le proxy Next.js forward le
 * cookie HttpOnly d'auth ; le token JWT n'est jamais exposé au client.
 */
export function useUploadInvoice() {
  const qc = useQueryClient();
  return useMutation<OcrUploadResponse, ApiError, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('document', file);
      const res = await fetch('/api/proxy/ocr/invoices/', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const detail =
          typeof data === 'object' && data !== null && 'document' in data
            ? String((data as { document?: unknown }).document ?? '')
            : typeof data === 'object' && data !== null && 'detail' in data
              ? String((data as { detail?: unknown }).detail ?? '')
              : '';
        throw new ApiError(res.status, data, detail || `Upload failed (${res.status})`);
      }
      return res.json() as Promise<OcrUploadResponse>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ocr.all });
    },
  });
}

/**
 * Récupère le détail d'un résultat OCR avec polling automatique.
 *
 * - `refetchInterval` renvoie `false` dès qu'un statut terminal est atteint,
 *   ce qui arrête proprement le polling sans setInterval manuel.
 * - Pause si l'onglet est en arrière-plan (`refetchIntervalInBackground: false`).
 */
export function useOcrResult(
  id: string | null | undefined,
  options: { pollingMs?: number } = {},
) {
  const pollingMs = options.pollingMs ?? 1500;
  return useQuery<OcrResult>({
    queryKey: qk.ocr.result(id ?? ''),
    queryFn: () => apiFetch<OcrResult>(`/ocr/results/${id}/`),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return pollingMs;
      return TERMINAL_STATUSES.has(data.status) ? false : pollingMs;
    },
    refetchIntervalInBackground: false,
  });
}

/** Exporté pour usage en test unitaire d'un helper d'arrêt du polling. */
export function isTerminalOcrStatus(status: OcrStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ── Validation humaine (Step 9A) ───────────────────────────────────────────

export interface ValidateReviewLinePayload {
  invoice_line_index: number;
  description: string;
  quantity: string | null;
  unit_price: string | null;
  line_total: string | null;
  decision: OcrReviewDecision;
  variant_id: string | null;
}

export interface ValidateReviewPayload {
  lines: ValidateReviewLinePayload[];
}

/**
 * Fige la revue humaine côté backend. Idempotence garantie côté serveur :
 * un retry réseau avec le même payload canonique renvoie 200. Un payload
 * divergent après validation retourne 409.
 *
 * Sur 409, on refetch l'OcrResult : si le serveur est déjà `validated`,
 * l'écran bascule automatiquement sur `ValidatedView`. On n'invalide PAS
 * sur les 400 (contrat client cassé, l'état serveur est inchangé).
 *
 * Aucun StockMovement n'est créé — l'entrée de stock est déclenchée en Step 10.
 */
export function useValidateOcrReview(ocrResultId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<OcrResult, ApiError, ValidateReviewPayload>({
    mutationFn: (payload: ValidateReviewPayload) =>
      apiFetch<OcrResult>(`/ocr/results/${ocrResultId}/validate/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      if (!ocrResultId) return;
      qc.setQueryData(qk.ocr.result(ocrResultId), data);
      qc.invalidateQueries({ queryKey: qk.ocr.result(ocrResultId) });
    },
    onError: (err) => {
      if (!ocrResultId) return;
      if (err instanceof ApiError && err.status === 409) {
        qc.invalidateQueries({ queryKey: qk.ocr.result(ocrResultId) });
      }
    },
  });
}
