import type { ProductDetail, ProductVariant } from '@/lib/hooks/useProducts';

export type VariantPick = {
  variantId: string; productId: string; productName: string; variantName: string;
  productType: 'product' | 'service'; unitPrice: string;
  /** Stock du format au moment du choix (articles seulement) : la ligne avertit s'il passera en négatif. */
  stock?: string;
};

/** Choix d'un format du catalogue ; un format en rupture s'ajoute aussi (la vente n'est jamais bloquée). */
export function variantPick(product: ProductDetail, v: ProductVariant): VariantPick {
  return {
    variantId: v.id, productId: product.id, productName: product.name, variantName: v.packaging_name,
    productType: product.type, unitPrice: v.selling_price,
    stock: product.type === 'product' ? v.stock_quantity : undefined,
  };
}
