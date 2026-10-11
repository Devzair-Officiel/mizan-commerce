'use client';

import { useTranslations } from 'next-intl';
import { useStockFormat } from '@/components/stock/useStockFormat';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { ProductDetail, ProductVariant } from '@/lib/hooks/useProducts';
import { isDefaultVariant } from '@/lib/products';

/** Libellés d'un format sur la fiche : nom (« Format unique »), prix, seuil, nom complet accessible. */
export function useFormatLabels(product: ProductDetail, currency: string) {
  const tc = useTranslations('stock.common');
  const f = useStockFormat();
  const formatMoney = useFormatMoney();
  return {
    name: (v: ProductVariant) => (isDefaultVariant(v.packaging_name) ? tc('single_format') : v.packaging_name),
    price: (v: ProductVariant) => formatMoney(v.selling_price, currency),
    threshold: (v: ProductVariant) => (v.low_stock_threshold == null ? '—' : f.quantity(v.low_stock_threshold)),
    full: (v: ProductVariant) => f.variantLabel(product.name, v.packaging_name),
  };
}

export type FormatLabels = ReturnType<typeof useFormatLabels>;
