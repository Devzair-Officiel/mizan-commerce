import { z } from 'zod';
import { sortedFormats } from '@/components/products/detail/productFormats';
import type { ProductDetail, ProductType, ProductUnit, ProductVariant } from '@/lib/hooks/useProducts';
import { isDefaultVariant } from '@/lib/products';

export const UNITS = ['piece', 'g', 'kg', 'mL', 'L', 'm'] as const;

/** Clé du libellé d'une unité dans `articles.units`. */
export const UNIT_NAMES = { piece: 'piece', g: 'gram', kg: 'kilogram', mL: 'milliliter', L: 'liter', m: 'meter' } as const satisfies Record<ProductUnit, string>;

/** Champs d'un format, dans l'ordre d'affichage : la première erreur dans cet ordre reçoit le focus. */
export const ROW_FIELDS = ['name', 'selling_price', 'purchase_price', 'initial_stock', 'low_stock_threshold', 'sku', 'barcode'] as const;
export type RowField = (typeof ROW_FIELDS)[number];

/** Précision des champs `DecimalField` du modèle : prix (12, 2), quantités (14, 3). */
const AMOUNT = /^\d{1,10}(?:[.,]\d{1,2})?$/;
const QUANTITY = /^\d{1,11}(?:[.,]\d{1,3})?$/;

type Translate = (key: string, values?: { max: number }) => string;

/**
 * `article` : champs de stock et de référence ; `multi` : tableau des formats, noms obligatoires et
 * uniques dans l'article. Sans `multi`, l'unique ligne est le format unique (nom technique caché).
 */
export function productSchema(t: Translate, { article, multi }: { article: boolean; multi: boolean }) {
  const text = (max: number) => z.string().trim().max(max, t('too_long', { max }));
  const optional = (pattern: RegExp, message: string) =>
    article ? z.string().trim().refine((v) => v === '' || pattern.test(v), t(message)) : z.string();
  const row = z.object({
    id: z.string().nullable(),
    name: multi ? text(120).min(1, t('format_name_required')) : z.string(),
    selling_price: z.string().trim().min(1, t('price_required')).regex(AMOUNT, t('amount_invalid')),
    purchase_price: optional(AMOUNT, 'amount_invalid'),
    initial_stock: optional(QUANTITY, 'quantity_invalid'),
    low_stock_threshold: optional(QUANTITY, 'quantity_invalid'),
    sku: article ? text(64) : z.string(),
    barcode: article ? text(64) : z.string(),
    is_active: z.boolean(),
  });
  return z.object({
    type: z.enum(['product', 'service']),
    name: text(200).min(1, t('name_required')),
    description: z.string(),
    unit: z.enum(UNITS),
    multi: z.boolean(),
    formats: z.array(row).superRefine((rows, ctx) => {
      if (!multi) return;
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        const key = r.name.toLocaleLowerCase();
        if (key && seen.has(key)) ctx.addIssue({ code: 'custom', path: [i, 'name'], message: t('format_name_taken') });
        seen.add(key);
      });
    }),
  });
}

export type ProductFormValues = z.infer<ReturnType<typeof productSchema>>;
export type FormatRow = ProductFormValues['formats'][number];

/** Quantité enregistrée (« 5.000 ») telle qu'on la saisit (« 5 »). */
const quantity = (value: string | null | undefined) => (value == null ? '' : String(Number(value)));

export const emptyRow = (): FormatRow => ({
  id: null, name: '', selling_price: '', purchase_price: '', initial_stock: '', low_stock_threshold: '', sku: '', barcode: '', is_active: true,
});

/** Format enregistré en ligne du formulaire ; le nom technique du format par défaut ne s'affiche pas. */
const rowOf = (v: ProductVariant): FormatRow => ({
  id: v.id, name: isDefaultVariant(v.packaging_name) ? '' : v.packaging_name,
  selling_price: v.selling_price, purchase_price: v.purchase_price ?? '', initial_stock: '',
  low_stock_threshold: quantity(v.low_stock_threshold), sku: v.sku, barcode: v.barcode, is_active: v.is_active,
});

/** Un service ne règle ici que son prix unique : avec plusieurs formats actifs, ils se règlent sur la fiche. */
export const serviceFormatsCount = (product: ProductDetail): number => product.variants.filter((v) => v.is_active).length;

/**
 * Valeurs initiales : un article montre tous ses formats (tableau dès qu'il en a plusieurs, même
 * retirés de la vente) ; un service, son seul format actif.
 */
export function defaultValues(type: ProductType, product: ProductDetail | undefined): ProductFormValues {
  const variants = product ? sortedFormats(product) : [];
  const active = variants.filter((v) => v.is_active);
  const rows = !product ? [emptyRow()]
    : type === 'service' ? (active.length === 1 ? active.map(rowOf) : [])
      : variants.length > 0 ? variants.map(rowOf) : [emptyRow()];
  return {
    type, name: product?.name ?? '', description: product?.description ?? '', unit: variants[0]?.unit ?? 'piece',
    multi: type === 'product' && rows.length > 1, formats: rows,
  };
}
