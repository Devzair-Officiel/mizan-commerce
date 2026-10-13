'use client';

import { useTranslations } from 'next-intl';
import { DetailRow } from '@/components/detail/DetailRow';
import { useStockFormat } from '@/components/stock/useStockFormat';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { ProductDetail } from '@/lib/hooks/useProducts';

/** Ventes des 30 derniers jours : « 14, soit 418,60 € », ou « Aucune vente ». */
export function ProductSalesRow({ product, currency, label }: { product: ProductDetail; currency: string; label: string }) {
  const t = useTranslations('articles.sheet');
  const f = useStockFormat();
  const formatMoney = useFormatMoney();
  const { quantity, amount } = product.sales_30d;
  return (
    <DetailRow label={label} className={quantity > 0 ? undefined : 'font-normal text-muted-foreground'}>
      {quantity > 0 ? t('sales_value', { quantity: f.quantity(quantity), amount: formatMoney(amount, currency) }) : t('no_sales')}
    </DetailRow>
  );
}
