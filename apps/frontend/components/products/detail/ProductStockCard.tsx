'use client';

import { useTranslations } from 'next-intl';
import { DetailRow } from '@/components/detail/DetailRow';
import { STATE_BADGE } from '@/components/stock/levels/StockStateBadge';
import { useStockFormat } from '@/components/stock/useStockFormat';
import { SectionCard } from '@/components/ui/SectionCard';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { ProductDetail, StockState } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';
import { activeFormats, sharedValue } from './productFormats';
import { ProductSalesRow } from './ProductSalesRow';

const TOTAL_TONE: Record<StockState, string> = {
  negative: 'text-red-700 dark:text-red-400',
  out: 'text-red-700 dark:text-red-400',
  low: 'text-amber-700 dark:text-amber-400',
  in: 'text-foreground',
};

/** Carte « Stock » : total tous formats, valeur d'achat, seuil d'alerte et ventes sur 30 jours. */
export function ProductStockCard({ product, currency }: { product: ProductDetail; currency: string }) {
  const t = useTranslations('articles.sheet');
  const tc = useTranslations('stock.common');
  const f = useStockFormat();
  const formatMoney = useFormatMoney();
  const formats = activeFormats(product);
  const negative = formats.filter((v) => v.stock_state === 'negative').length;
  const thresholds = sharedValue(formats.map((v) => v.low_stock_threshold));
  const threshold = !thresholds ? (formats.length > 0 ? t('per_format') : '—')
    : thresholds.value == null ? tc('none')
      : formats.length > 1 ? t('threshold_each', { threshold: f.quantity(thresholds.value) }) : f.quantity(thresholds.value);
  const badge = negative > 0 && (
    <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', STATE_BADGE.negative)}>
      {t('negative_formats', { count: negative })}
    </span>
  );

  return (
    <SectionCard title={t('stock_title')} rightSlot={badge || undefined}>
      <div className="px-4 pt-4 lg:px-5">
        <p className={cn('text-[28px] font-bold leading-tight tabular-nums', TOTAL_TONE[product.stock_state ?? 'in'])}>
          {f.quantity(product.stock_total ?? '0')}
        </p>
        <p className="text-sm text-muted-foreground">{t('stock_total_hint', { count: formats.length })}</p>
      </div>
      <dl className="divide-y divide-border">
        <DetailRow label={t('purchase_value')}>
          {product.purchase_value == null ? tc('none') : formatMoney(product.purchase_value, currency)}
        </DetailRow>
        <DetailRow label={t('threshold')}>{threshold}</DetailRow>
        <ProductSalesRow product={product} currency={currency} label={t('sold_30d')} />
      </dl>
    </SectionCard>
  );
}
