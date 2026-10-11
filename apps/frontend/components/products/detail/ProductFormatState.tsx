import { useTranslations } from 'next-intl';
import { StockStateBadge } from '@/components/stock/levels/StockStateBadge';
import type { ProductVariant } from '@/lib/hooks/useProducts';

/** État d'un format : badge de stock, ou « Inactif » pour un format retiré de la vente. */
export function ProductFormatState({ variant }: { variant: ProductVariant }) {
  const t = useTranslations('articles.badges');
  if (variant.is_active) return <StockStateBadge state={variant.stock_state} />;
  return (
    <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
      {t('inactive')}
    </span>
  );
}
