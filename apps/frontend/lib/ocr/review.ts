/**
 * Utilitaires purs pour l'écran de revue de facture OCR.
 *
 * Aucune dépendance React ni réseau : ces fonctions sont pensées pour
 * être testables isolément et permettent aux composants d'afficher un
 * draft cohérent sans risquer de convertir prématurément des montants
 * métier en `number` (perte de précision Decimal côté API).
 */

import type {
  OcrInvoice,
  OcrInvoiceLine,
  OcrLine,
  OcrMatching,
  OcrMatchingCandidate,
} from '@/lib/hooks/useOcr';

export interface ReviewedInvoiceLine {
  invoiceLineIndex: number;
  description: string;
  /** Montants conservés en STRING : aucune conversion Decimal→float côté frontend. */
  quantity: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  /** `null` tant que l'utilisateur n'a pas explicitement choisi/confirmé un candidat. */
  selectedVariantId: string | null;
}

/**
 * Construit le draft de revue à partir de la facture structurée.
 * `selectedVariantId` reste `null` même si un unique candidat sku_exact
 * existe : la validation implicite est interdite (Step 8 = revue uniquement).
 */
export function buildReviewDraft(invoice: OcrInvoice): ReviewedInvoiceLine[] {
  return invoice.lines.map((line, index) => ({
    invoiceLineIndex: index,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    lineTotal: line.line_total,
    selectedVariantId: null,
  }));
}

/**
 * Confiance OCR d'une ligne facture : moyenne des `confidence` des
 * blocs OCR référencés par `source_line_indices`.
 *
 * Retourne `null` si aucun indice valide n'est trouvé — on préfère
 * l'absence à une valeur inventée. Un indice hors bornes ou non
 * numérique est ignoré silencieusement.
 */
export function computeLineOcrConfidence(
  sourceLineIndices: readonly number[] | null | undefined,
  ocrLines: readonly OcrLine[] | null | undefined,
): number | null {
  if (!sourceLineIndices || !ocrLines || sourceLineIndices.length === 0) {
    return null;
  }
  const validConfidences: number[] = [];
  for (const idx of sourceLineIndices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= ocrLines.length) continue;
    const line = ocrLines[idx];
    if (!line) continue;
    if (!Number.isFinite(line.confidence)) continue;
    validConfidences.push(line.confidence);
  }
  if (validConfidences.length === 0) return null;
  const sum = validConfidences.reduce((acc, v) => acc + v, 0);
  return sum / validConfidences.length;
}

/**
 * Retourne le candidat matching à afficher par défaut pour une ligne
 * facture (le meilleur — le backend a déjà trié par kind puis score).
 * `null` si aucun candidat n'a été proposé.
 */
export function bestCandidateForLine(
  matching: OcrMatching | null,
  invoiceLineIndex: number,
): OcrMatchingCandidate | null {
  if (!matching || matching.status !== 'done') return null;
  const matchLine = matching.lines.find(
    (line) => line.invoice_line_index === invoiceLineIndex,
  );
  if (!matchLine || matchLine.candidates.length === 0) return null;
  return matchLine.candidates[0] ?? null;
}

/**
 * Candidats disponibles pour une ligne (0..3), triés par le backend.
 */
export function candidatesForLine(
  matching: OcrMatching | null,
  invoiceLineIndex: number,
): readonly OcrMatchingCandidate[] {
  if (!matching || matching.status !== 'done') return [];
  const matchLine = matching.lines.find(
    (line) => line.invoice_line_index === invoiceLineIndex,
  );
  return matchLine?.candidates ?? [];
}

export interface ReviewPayloadLine {
  invoice_line_index: number;
  description: string;
  quantity: string | null;
  unit_price: string | null;
  line_total: string | null;
  variant_id: string | null;
}

export interface ReviewPayload {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string | null;
  subtotal: string | null;
  tax_amount: string | null;
  total: string | null;
  lines: ReviewPayloadLine[];
}

/**
 * Construit le payload de revue qui sera envoyé à Step 9 (validation).
 * NE PAS appeler l'API depuis Step 8 : cette fonction reste pure et
 * ne fait qu'assembler l'état local en un dict sérialisable.
 *
 * Les montants sont conservés en STRING — jamais convertis en float.
 * Les lignes non modifiables (facture d'en-tête) sont copiées telles
 * quelles depuis l'`OcrInvoice` source.
 */
export function buildReviewPayload(
  invoice: OcrInvoice,
  draft: readonly ReviewedInvoiceLine[],
): ReviewPayload {
  return {
    supplier_name: invoice.supplier_name,
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    tax_amount: invoice.tax_amount,
    total: invoice.total,
    lines: draft.map((line) => ({
      invoice_line_index: line.invoiceLineIndex,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.lineTotal,
      variant_id: line.selectedVariantId,
    })),
  };
}

/**
 * Wrapper pratique : construit un draft vide (utilisé quand l'invoice
 * est absente mais qu'on veut initialiser un état stable).
 */
export function emptyDraft(): ReviewedInvoiceLine[] {
  return [];
}

/** Type-only re-export pour éviter les imports circulaires côté composants. */
export type { OcrInvoiceLine };
