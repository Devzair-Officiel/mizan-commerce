import type { ProductDetail } from '@/lib/hooks/useProducts';

export type ProductBadgeKey = 'inactive' | 'out_of_stock' | 'low_stock' | 'service' | 'active';
export type ProductBadge = { labelKey: ProductBadgeKey; classes: string };

export function getProductBadge(product: ProductDetail): ProductBadge {
  if (!product.is_active) {
    return {
      labelKey: 'inactive',
      classes: 'bg-muted text-muted-foreground border border-border',
    };
  }
  if (product.type === 'product' && product.is_out_of_stock) {
    return {
      labelKey: 'out_of_stock',
      classes: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-400/20',
    };
  }
  if (product.type === 'product' && product.is_low_stock) {
    return {
      labelKey: 'low_stock',
      classes: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-400/20',
    };
  }
  return {
    labelKey: product.type === 'service' ? 'service' : 'active',
    classes: 'bg-primary/10 text-primary border border-primary/20',
  };
}
