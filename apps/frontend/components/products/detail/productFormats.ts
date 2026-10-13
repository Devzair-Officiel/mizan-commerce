import type { ProductDetail, ProductVariant } from '@/lib/hooks/useProducts';
import type { QuickEntryVariant } from '@/components/stock/quick-entry/QuickEntryForm';

/** Formats dans l'ordre de la fiche : position, puis nom. */
export function sortedFormats(product: ProductDetail): ProductVariant[] {
  return [...product.variants].sort((a, b) => a.position - b.position || a.packaging_name.localeCompare(b.packaging_name));
}

export const activeFormats = (product: ProductDetail): ProductVariant[] => sortedFormats(product).filter((v) => v.is_active);

/** Valeur commune à tous les formats, `null` s'il n'y en a aucun ou si elle diffère d'un format à l'autre. */
export function sharedValue<T>(values: T[]): { value: T } | null {
  if (values.length === 0) return null;
  const [first] = values as [T, ...T[]];
  return values.every((v) => v === first) ? { value: first } : null;
}

/** Format à réapprovisionner, tel que l'attend l'entrée rapide. */
export const quickEntryOf = (product: ProductDetail, variant: ProductVariant): QuickEntryVariant => ({
  id: variant.id,
  product_name: product.name,
  packaging_name: variant.packaging_name,
  stock_quantity: variant.stock_quantity,
  purchase_price: variant.purchase_price,
});
