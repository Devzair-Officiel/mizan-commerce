/** Formats et taille acceptés par `POST /ocr/invoices/` (le serveur reste seul juge). */
export const INVOICE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const INVOICE_MAX_MB = 10;

/** Problème d'une photo de facture avant l'envoi, `null` si elle est acceptable. */
export function invoiceFileProblem(file: File): 'type' | 'size' | null {
  if (!INVOICE_TYPES.includes(file.type)) return 'type';
  if (file.size > INVOICE_MAX_MB * 1024 * 1024) return 'size';
  return null;
}
