import { useTranslations } from 'next-intl';
import { STATE_BADGE } from '@/components/stock/levels/StockStateBadge';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';

type BadgeKey = 'inactive' | 'negative_stock' | 'out_of_stock' | 'low_stock';

const TONE: Record<BadgeKey, string> = {
  inactive: 'bg-muted text-muted-foreground',
  negative_stock: STATE_BADGE.negative,
  out_of_stock: STATE_BADGE.out,
  low_stock: STATE_BADGE.low,
};

function badgeOf(product: ProductDetail): BadgeKey | null {
  if (!product.is_active) return 'inactive';
  if (product.type !== 'product') return null;
  if (product.stock_state === 'negative') return 'negative_stock';
  if (product.stock_state === 'out') return 'out_of_stock';
  if (product.stock_state === 'low') return 'low_stock';
  return null;
}

/** Badge d'état de l'article : seulement quand il demande de l'attention (stock, inactif). */
export function ProductStatusBadge({ product, className }: { product: ProductDetail; className?: string }) {
  const t = useTranslations('articles.badges');
  const key = badgeOf(product);
  if (!key) return null;
  return (
    <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', TONE[key], className)}>
      {t(key)}
    </span>
  );
}
