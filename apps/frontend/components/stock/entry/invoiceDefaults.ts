import type { OcrMatchingCandidate, OcrResult } from '@/lib/hooks/useOcr';
import type { StockEntryValues } from './useStockEntryForm';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Montant lu (« 28.000 ») au format du champ (« 28.00 ») ; `null` s'il est illisible ou hors bornes. */
function readDecimal(value: string | null, digits: number, positive: boolean): string | null {
  const n = Number(value);
  if (value === null || value.trim() === '' || !Number.isFinite(n) || n < 0 || (positive && n === 0)) return null;
  return digits === 2 ? n.toFixed(2) : String(Number(n.toFixed(digits)));
}

/** Lignes préremplies depuis la facture lue : quantité, prix, texte lu et association trouvée. */
export function invoiceDefaults(result: OcrResult): StockEntryValues {
  const invoice = result.invoice;
  const matching = new Map((result.matching?.lines ?? []).map((line) => [line.invoice_line_index, line.association]));
  return {
    lines: (invoice?.lines ?? []).map((line, index) => {
      const association = matching.get(index) ?? null;
      return {
        variant: association?.variant_id ?? '',
        name: association?.product_name ?? '',
        packaging: association?.packaging_name ?? '',
        stock: null,
        quantity: readDecimal(line.quantity, 3, true) ?? '1',
        price: readDecimal(line.unit_price, 2, false) ?? '',
        invoiceIndex: index,
        readLabel: line.description.trim() || line.supplier_reference || '',
      };
    }),
    supplier_name: (invoice?.supplier_name ?? '').slice(0, 255),
    invoice_number: (invoice?.invoice_number ?? '').slice(0, 100),
    invoice_date: invoice?.invoice_date && ISO_DATE.test(invoice.invoice_date) ? invoice.invoice_date : '',
  };
}

/** Suggestions de chaque ligne lue, par index de ligne de facture. */
export function invoiceCandidates(result: OcrResult): Map<number, OcrMatchingCandidate[]> {
  return new Map((result.matching?.lines ?? []).map((line) => [line.invoice_line_index, line.candidates]));
}
