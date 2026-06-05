import type { ProductDetail } from '@/lib/hooks/useProducts';

export type ProductBadge = { label: string; classes: string };

export function getProductBadge(product: ProductDetail): ProductBadge {
  if (!product.is_active) {
    return {
      label: 'Inactif',
      classes: 'bg-muted text-muted-foreground border border-border',
    };
  }
  if (product.type === 'product' && product.is_out_of_stock) {
    return {
      label: 'Rupture',
      classes: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-400/20',
    };
  }
  if (product.type === 'product' && product.is_low_stock) {
    return {
      label: 'Stock faible',
      classes: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-400/20',
    };
  }
  return {
    label: product.type === 'service' ? 'Service' : 'Actif',
    classes: 'bg-primary/10 text-primary border border-primary/20',
  };
}
