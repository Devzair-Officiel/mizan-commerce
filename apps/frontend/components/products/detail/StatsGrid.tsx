import { AlertTriangle, Boxes, Tag } from 'lucide-react';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { formatPriceRange } from '@/lib/hooks/useProducts';

export function StatsGrid({ product }: { product: ProductDetail }) {
  const isProduct = product.type === 'product';
  const priceRange = formatPriceRange(product.min_selling_price, product.max_selling_price);
  const variantCount = product.variant_count ?? product.variants.length;
  const stockTone =
    product.is_out_of_stock
      ? 'text-red-600 dark:text-red-400'
      : product.is_low_stock
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground';
  const priceLabel = priceRange ?? product.variants[0]?.selling_price ?? '—';

  if (!isProduct) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Tag size={12} className="text-muted-foreground/80" />
          <p className="text-xs text-muted-foreground">Prix de la prestation</p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{priceLabel} €</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Boxes size={13} className="text-muted-foreground/80" />
            <p className="text-xs text-muted-foreground">Formats actifs</p>
          </div>
          {(product.is_out_of_stock || product.is_low_stock) && (
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} />
            </div>
          )}
        </div>
        <p className={`text-2xl font-bold tabular-nums ${stockTone}`}>{variantCount}</p>
        <p className="text-[11px] text-muted-foreground/80">Détail par format ci-dessous</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Tag size={12} className="text-muted-foreground/80" />
          <p className="text-xs text-muted-foreground">Prix de vente</p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{priceLabel} €</p>
        {variantCount > 1 && (
          <p className="text-[11px] text-muted-foreground/80">Selon le conditionnement</p>
        )}
      </div>
    </div>
  );
}
