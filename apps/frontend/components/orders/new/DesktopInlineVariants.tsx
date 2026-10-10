'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { productPickQueryOptions } from '@/lib/hooks/useProducts';
import { isDefaultVariant } from '@/lib/products';
import { DesktopAddButton } from '@/components/orders/new/DesktopAddButton';
import type { LineItem } from '@/components/orders/new/types';
import type { VariantPick } from '@/components/orders/picker/VariantView';

/** Variantes d'un article, dépliées sous sa ligne dans le catalogue grand écran. */
export function DesktopInlineVariants({ productId, items, onPick, money }: {
  productId: string; items: LineItem[];
  onPick: (pick: VariantPick) => void; money: (v: number | string) => string;
}) {
  const t = useTranslations('orders.picker');
  const { data: product, isError } = useQuery(productPickQueryOptions(productId));

  if (isError) return <p className="px-5 py-3 text-xs text-destructive">{t('add_error')}</p>;
  if (!product) return <p className="px-5 py-3 text-xs text-muted-foreground">{t('loading')}</p>;
  return (
    <div className="divide-y divide-border/60 bg-muted/30">
      {product.variants.filter((v) => v.is_active).map((v) => {
        const out = product.type === 'product' && parseFloat(v.stock_quantity) <= 0;
        const qtyInCart = items.filter((i) => i.variant === v.id).reduce((a, c) => a + c.quantity, 0);
        const pick: VariantPick = { variantId: v.id, productId: product.id, productName: product.name, variantName: v.packaging_name, productType: product.type, unitPrice: v.selling_price };
        const isDefault = isDefaultVariant(v.packaging_name);
        return (
          <div key={v.id} className="flex items-center gap-3 px-5 py-2.5">
            <div className="flex-1 min-w-0">
              {!isDefault && <span className="text-sm text-foreground">{v.packaging_name}</span>}
              <span className={`${isDefault ? '' : 'ms-2 '}text-[0.8125rem] tabular-nums ${out ? 'text-destructive' : 'text-muted-foreground'}`}>
                {money(v.selling_price)}
                {product.type === 'product' && <> · {out ? t('out_of_stock') : t('stock_label', { qty: v.stock_quantity })}</>}
              </span>
            </div>
            <DesktopAddButton name={`${product.name} – ${v.packaging_name}`} qty={qtyInCart} onClick={() => onPick(pick)} />
          </div>
        );
      })}
    </div>
  );
}
