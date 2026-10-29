import { z } from 'zod';
import type { DraftPayload } from '@/lib/hooks/useInvoiceDrafts';
import type { Invoice, OperationCategory } from '@/lib/hooks/useInvoices';
import type { CatalogKind } from '@/lib/hooks/useMe';

/** Saisie décimale (virgule ou point) : 9 chiffres avant, `places` après, comme les champs du modèle. */
const decimalPattern = (places: number) => new RegExp(`^\\d{1,9}([.,]\\d{0,${places}})?$`);
const QUANTITY = decimalPattern(3);
const MONEY = decimalPattern(2);

/** Longueurs maximales : posées en `maxLength` sur les champs, comme le serializer du brouillon. */
export const MAX_LENGTH = { description: 300, details: 2000, unit: 30, notes: 2000 } as const;

export function editorSchema(t: (key: 'amount_invalid' | 'quantity_invalid' | 'days_invalid') => string) {
  const money = z.string().trim().refine((v) => v === '' || MONEY.test(v), t('amount_invalid'));
  return z.object({
    customer: z.string(),
    operation_category: z.enum(['goods', 'services', 'mixed']),
    payment_terms_days: z.string().trim().refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 365), t('days_invalid')),
    discount_amount: money,
    shipping_amount: money,
    notes: z.string(),
    lines: z.array(z.object({
      description: z.string(),
      details: z.string(),
      unit: z.string(),
      quantity: z.string().trim().refine((v) => v === '' || QUANTITY.test(v), t('quantity_invalid')),
      unit_price_ht: money,
    })),
  });
}

export type EditorValues = z.infer<ReturnType<typeof editorSchema>>;
export type EditorLine = EditorValues['lines'][number];

export const EMPTY_LINE: EditorLine = { description: '', details: '', unit: '', quantity: '1', unit_price_ht: '' };

/** Nature de l'opération par défaut, selon le catalogue de la boutique (toujours modifiable). */
const OPERATION_BY_CATALOG: Record<CatalogKind, OperationCategory> = { products: 'goods', services: 'services', both: 'mixed' };

/** Valeurs du formulaire : depuis le brouillon enregistré, sinon celles qu'aura un nouveau brouillon. */
export function editorDefaults(invoice: Invoice | undefined, shop: { catalog_kind: CatalogKind; default_payment_terms_days: number } | undefined): EditorValues {
  if (!invoice) return {
    customer: '', operation_category: OPERATION_BY_CATALOG[shop?.catalog_kind ?? 'services'],
    payment_terms_days: shop ? String(shop.default_payment_terms_days) : '', discount_amount: '', shipping_amount: '', notes: '',
    lines: [EMPTY_LINE],
  };
  const zero = (v: string) => (Number(v) ? v : '');
  return {
    customer: invoice.customer ?? '', operation_category: invoice.operation_category,
    payment_terms_days: invoice.payment_terms_days === null ? '' : String(invoice.payment_terms_days),
    discount_amount: zero(invoice.discount_amount), shipping_amount: zero(invoice.shipping_amount), notes: invoice.notes,
    lines: invoice.lines.length
      ? invoice.lines.map((l) => ({ description: l.description, details: l.details, unit: l.unit, quantity: String(Number(l.quantity)), unit_price_ht: l.unit_price_ht }))
      : [EMPTY_LINE],
  };
}

/** Saisie normalisée (« 12,5 » → « 12.5 ») ou `null` si elle est vide ou illisible. */
export function decimal(value: string, places: 2 | 3): string | null {
  const v = value.trim();
  return decimalPattern(places).test(v) ? v.replace(',', '.').replace(/\.$/, '') : null;
}

/**
 * Brouillon envoyé au serveur : seules les lignes nommées, de quantité positive, partent ; un prix
 * vide vaut 0. Les montants restent des chaînes (Decimal côté serveur, jamais de float).
 */
export function toPayload(v: EditorValues): DraftPayload {
  const days = v.payment_terms_days.trim();
  return {
    customer: v.customer || null,
    operation_category: v.operation_category,
    payment_terms_days: /^\d{1,3}$/.test(days) && Number(days) <= 365 ? Number(days) : null,
    discount_amount: decimal(v.discount_amount, 2) ?? '0',
    shipping_amount: decimal(v.shipping_amount, 2) ?? '0',
    notes: v.notes.trim(),
    lines: v.lines.flatMap((l) => {
      const quantity = decimal(l.quantity, 3);
      if (!l.description.trim() || !quantity || !Number(quantity)) return [];
      return [{ description: l.description.trim(), details: l.details.trim(), unit: l.unit.trim(), quantity, unit_price_ht: decimal(l.unit_price_ht, 2) ?? '0' }];
    }),
  };
}

/** Division entière arrondie au pair, comme `Decimal.quantize` côté serveur. */
function divideHalfEven(n: number, d: number): number {
  const q = Math.floor(n / d);
  const r = n - q * d;
  if (2 * r > d) return q + 1;
  if (2 * r < d) return q;
  return q % 2 === 0 ? q : q + 1;
}

const cents = (value: string) => Math.round(Number(decimal(value, 2) ?? 0) * 100);

/** Total d'une ligne en centimes (quantité en millièmes × prix en centimes, arrondi au centime). */
export function lineCents(line: Pick<EditorLine, 'quantity' | 'unit_price_ht'>): number {
  const milli = Math.round(Number(decimal(line.quantity, 3) ?? 0) * 1000);
  return divideHalfEven(milli * cents(line.unit_price_ht), 1000);
}

/** Totaux estimés en centimes, même formule que `compute_totals` : le serveur fait foi à l'émission. */
export function estimateTotals(v: Pick<EditorValues, 'lines' | 'discount_amount' | 'shipping_amount'>, taxRate: string) {
  const subtotal = v.lines.reduce((sum, l) => sum + (l.description.trim() ? lineCents(l) : 0), 0);
  const discount = cents(v.discount_amount);
  const shipping = cents(v.shipping_amount);
  const base = subtotal - discount + shipping;
  const tax = divideHalfEven(Math.abs(base) * Math.round(Number(taxRate) * 100), 10_000) * Math.sign(base);
  return { subtotal, discount, shipping, tax, total: base + tax };
}

/** Échéance affichée : aucune (champ vide), à réception (0) ou à N jours. */
export function paymentTerms(days: string): { terms: 'none' | 'receipt' | 'days'; days: number } {
  const value = days.trim();
  return { terms: value === '' ? 'none' : Number(value) === 0 ? 'receipt' : 'days', days: Number(value) };
}
