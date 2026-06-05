import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Sparkles } from 'lucide-react';
import { formatPriceRange, type Product } from '@/lib/hooks/useProducts';

const THUMB_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-primary/15 text-primary',
];

function thumbColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return THUMB_COLORS[code % THUMB_COLORS.length];
}

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed[0]?.toUpperCase() ?? '?';
}

export function ProductRow({ product, first }: { product: Product; first: boolean }) {
  const range = formatPriceRange(product.min_selling_price, product.max_selling_price);
  const priceLabel = range ?? '—';
  return (
    <Link
      href={`/products/${product.id}`}
      className={`flex items-center gap-3 px-3 py-3 active:bg-muted transition-colors ${
        first ? '' : 'border-t border-border'
      }`}
    >
      <ProductThumb product={product} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground capitalize truncate">{product.name}</span>
          {!product.is_active && (
            <span className="shrink-0 rounded-full bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              Inactif
            </span>
          )}
        </div>
        <StockLine product={product} />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-foreground tabular-nums">{priceLabel} €</span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>
    </Link>
  );
}

function ProductThumb({ product }: { product: Product }) {
  if (product.primary_image) {
    return (
      <Image
        src={product.primary_image}
        alt={product.name}
        width={44}
        height={44}
        unoptimized
        className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-border"
      />
    );
  }

  if (product.type === 'service') {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles size={18} />
      </div>
    );
  }

  return (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold ${thumbColor(product.name)}`}>
      {getInitial(product.name)}
    </div>
  );
}

function StockLine({ product }: { product: Product }) {
  const variantCount = product.variant_count ?? 0;
  const formatsLabel = variantCount > 1
    ? `${variantCount} formats`
    : '1 format';

  if (product.type === 'service') {
    return <p className="text-xs text-muted-foreground mt-0.5">Service</p>;
  }
  if (product.is_out_of_stock) {
    return (
      <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-0.5">
        Rupture
      </p>
    );
  }
  if (product.is_low_stock) {
    return (
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-0.5">
        Stock faible · <span className="tabular-nums">{formatsLabel}</span>
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      <span className="tabular-nums">{formatsLabel}</span> en stock
    </p>
  );
}
