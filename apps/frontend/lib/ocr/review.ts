/**
 * Utilitaires purs pour l'écran de revue de facture OCR (Steps 8-9).
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
  OcrReviewDecision,
  ValidateReviewLinePayload,
  ValidateReviewPayload,
} from '@/lib/hooks/useOcr';

export interface ReviewedInvoiceLine {
  invoiceLineIndex: number;
  description: string;
  /** Montants conservés en STRING : aucune conversion Decimal→float côté frontend. */
  quantity: string | null;
  unitPrice: string | null;
  lineTotal: string | null;
  /**
   * Décision utilisateur explicite : `null` = ligne encore à traiter,
   * `'stock'` = entrera en stock (variante requise), `'ignore'` = ignorée.
   */
  decision: OcrReviewDecision | null;
  /** Défini uniquement pour `decision === 'stock'`. */
  selectedVariantId: string | null;
  /** Snapshots d'affichage — évitent une requête catalogue pour rendre la ligne confirmée. */
  selectedProductName: string | null;
  selectedPackagingName: string | null;
}

/**
 * Construit le draft de revue à partir de la facture structurée.
 * Aucune décision n'est présélectionnée — même un unique candidat
 * sku_exact avec score 100 doit être coché explicitement (règle Step 8-9).
 */
export function buildReviewDraft(invoice: OcrInvoice): ReviewedInvoiceLine[] {
  return invoice.lines.map((line, index) => ({
    invoiceLineIndex: index,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    lineTotal: line.line_total,
    decision: null,
    selectedVariantId: null,
    selectedProductName: null,
    selectedPackagingName: null,
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

/**
 * Une chaîne représente-t-elle une quantité strictement positive ?
 * Utilise Number() pour un check numérique tolérant mais ne consomme jamais
 * la valeur : on ne convertit pas les montants en float pour envoi API.
 */
export function isPositiveQuantityString(qty: string | null | undefined): boolean {
  if (qty == null) return false;
  const trimmed = qty.trim();
  if (trimmed === '') return false;
  const normalized = trimmed.replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0;
}

/**
 * Une ligne `stock` est-elle prête pour validation ?
 * Requiert : variant sélectionné + quantité > 0.
 * (Le backend impose aussi `unit_price` et `line_total` non nuls quand décision=stock ;
 * l'utilisateur peut les corriger dans le formulaire.)
 */
export function isStockLineReady(line: ReviewedInvoiceLine): boolean {
  if (line.decision !== 'stock') return false;
  if (line.selectedVariantId === null) return false;
  if (!isPositiveQuantityString(line.quantity)) return false;
  return true;
}

/**
 * Le draft est-il prêt à être envoyé au backend ?
 * Requiert : au moins une ligne, toutes les lignes décidées, et toutes les lignes
 * `stock` valides.
 */
export function isDraftReady(draft: readonly ReviewedInvoiceLine[]): boolean {
  if (draft.length === 0) return false;
  for (const line of draft) {
    if (line.decision === null) return false;
    if (line.decision === 'stock' && !isStockLineReady(line)) return false;
  }
  return true;
}

export interface DecisionCounts {
  stock: number;
  ignore: number;
  pending: number;
}

/**
 * Compte les lignes par état de décision — utilisé pour l'UI (résumé
 * sticky, confirmation modal).
 */
export function countDecisions(draft: readonly ReviewedInvoiceLine[]): DecisionCounts {
  const counts: DecisionCounts = { stock: 0, ignore: 0, pending: 0 };
  for (const line of draft) {
    if (line.decision === 'stock') counts.stock += 1;
    else if (line.decision === 'ignore') counts.ignore += 1;
    else counts.pending += 1;
  }
  return counts;
}

/**
 * Construit le payload de validation à envoyer au backend Step 9A.
 * Retourne uniquement `{ lines: [...] }` — les métadonnées fournisseur
 * ne font PAS partie du contrat de validation (Step 9A n'y touche pas).
 *
 * Les montants restent en STRING — aucune conversion float.
 * `decision === 'ignore'` force `variant_id = null` côté payload,
 * même si un variant avait été sélectionné puis basculé.
 */
export function buildReviewPayload(
  draft: readonly ReviewedInvoiceLine[],
): ValidateReviewPayload {
  const lines: ValidateReviewLinePayload[] = draft
    .filter((line): line is ReviewedInvoiceLine & { decision: OcrReviewDecision } =>
      line.decision !== null,
    )
    .map((line) => ({
      invoice_line_index: line.invoiceLineIndex,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: line.lineTotal,
      decision: line.decision,
      variant_id: line.decision === 'stock' ? line.selectedVariantId : null,
    }));
  return { lines };
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
