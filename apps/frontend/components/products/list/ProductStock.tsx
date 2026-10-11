import { useTranslations } from 'next-intl';
import { useFormatNumber } from '@/lib/hooks/useFormat';
import type { Product } from '@/lib/hooks/useProducts';

/**
 * Stock total d'un article : badge rouge « Rupture », quantité en ambre sous
 * le seuil d'alerte, sinon la quantité. Rien pour un service.
 * `labelled` ajoute « en stock » (liste mobile, sans en-tête de colonne).
 */
export function ProductStock({ product, labelled }: { product: Product; labelled?: boolean }) {
  const t = useTranslations('articles.list');
  const formatNumber = useFormatNumber();
  if (product.type === 'service') return null;
  if (product.is_out_of_stock) {
    return (
      <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-red-500/10 px-2.5 text-xs font-semibold text-red-700 dark:text-red-400">
        {t('out_of_stock')}
      </span>
    );
  }
  const stock = formatNumber(parseFloat(product.total_stock ?? '0'), { maximumFractionDigits: 3 });
  const text = labelled ? t('in_stock', { stock }) : stock;
  if (product.is_low_stock) {
    return (
      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
        {text}<span className="sr-only">{t('low_stock_hint')}</span>
      </span>
    );
  }
  return <span className="whitespace-nowrap text-sm tabular-nums">{text}</span>;
}
