import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { Product } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';

/** Prix d'un article : une fourchette quand ses formats ont des prix différents. */
export function ProductPrice({ product, currency, className }: { product: Product; currency: string; className?: string }) {
  const formatMoney = useFormatMoney();
  const { min_selling_price: min, max_selling_price: max } = product;
  if (!min || !max) return <span className={cn('text-muted-foreground', className)}>—</span>;
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      {min === max ? formatMoney(min, currency) : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`}
    </span>
  );
}
