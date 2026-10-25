/**
 * Formats et taille acceptés par `POST /ocr/invoices/` (le serveur reste seul juge : il vérifie
 * aussi le contenu du fichier et, pour un PDF, le mot de passe et le nombre de pages).
 */
export const INVOICE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const INVOICE_MAX_MB = 10;
export const INVOICE_PDF_MAX_PAGES = 5;

/** Codes du refus d'un document par le serveur (`code` de la réponse 400), traduits à l'écran. */
export const INVOICE_REFUSALS = [
  'image_too_large', 'image_unreadable', 'pdf_page_too_large', 'pdf_protected', 'pdf_too_many_pages', 'pdf_unreadable',
  'signature', 'too_large', 'type',
] as const;
export type InvoiceRefusal = (typeof INVOICE_REFUSALS)[number];

export function isInvoiceRefusal(code: unknown): code is InvoiceRefusal {
  return INVOICE_REFUSALS.some((refusal) => refusal === code);
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf';
}

/** Problème d'une photo ou d'un PDF de facture avant l'envoi, `null` s'il est acceptable. */
export function invoiceFileProblem(file: File): 'type' | 'size' | null {
  if (!INVOICE_TYPES.includes(file.type)) return 'type';
  if (file.size > INVOICE_MAX_MB * 1024 * 1024) return 'size';
  return null;
}
