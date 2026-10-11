'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type { Product } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';
import { ProductPrice } from './ProductPrice';
import { ProductStock } from './ProductStock';
import { ProductThumb } from './ProductThumb';

interface ProductRowProps {
  product: Product;
  first: boolean;
  currency: string;
}

/**
 * Ligne de la liste mobile, avec le vocabulaire du tableau : nombre de formats
 * (ou « Service ») sous le nom ; à droite le prix et le stock. Un article
 * inactif est atténué.
 */
export function ProductRow({ product, first, currency }: ProductRowProps) {
  const t = useTranslations('articles.list');
  const dim = !product.is_active && 'opacity-60';

  return (
    <Link
      href={`/products/${product.id}`}
      className={cn('flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-muted', !first && 'border-t border-border')}
    >
      <ProductThumb product={product} className={cn('size-11 text-base', dim)} />
      <div className={cn('min-w-0 flex-1', dim)}>
        <div className="flex items-center gap-2">
          <span dir="auto" className="truncate font-semibold text-foreground">{product.name}</span>
          {!product.is_active && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">
              {t('state_inactive')}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {product.type === 'service' ? t('service') : t('formats', { count: product.variant_count })}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 leading-tight">
        <ProductPrice product={product} currency={currency} className="text-sm font-semibold" />
        <ProductStock product={product} labelled />
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
    </Link>
  );
}
