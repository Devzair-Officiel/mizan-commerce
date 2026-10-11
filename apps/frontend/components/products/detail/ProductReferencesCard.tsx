'use client';

import { useTranslations } from 'next-intl';
import { DetailRow } from '@/components/detail/DetailRow';
import { UNIT_NAMES } from '@/components/products/form/useProductForm';
import { SectionCard } from '@/components/ui/SectionCard';
import { useFormatMoney, useFormatNumber } from '@/lib/hooks/useFormat';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { activeFormats, sharedValue } from './productFormats';

/** Carte « Références » : référence, code-barres, unité, prix d'achat et marge, communs aux formats. */
export function ProductReferencesCard({ product, currency }: { product: ProductDetail; currency: string }) {
  const t = useTranslations('articles.sheet');
  const tc = useTranslations('stock.common');
  const tUnits = useTranslations('articles.units');
  const formatMoney = useFormatMoney();
  const formatNumber = useFormatNumber();
  const formats = activeFormats(product);
  const shared = <T,>(pick: (v: (typeof formats)[number]) => T) => sharedValue(formats.map(pick));
  const show = (value: { value: string | null } | null, render: (v: string) => string = (v) => v) => (
    !value ? (formats.length > 0 ? t('per_format') : tc('none')) : value.value ? render(value.value) : tc('none')
  );
  const unit = shared((v) => v.unit);
  const selling = shared((v) => v.selling_price);
  const purchase = shared((v) => v.purchase_price);
  const purchaseLabel = (price: string) => {
    const sale = Number(selling?.value);
    if (!sale) return formatMoney(price, currency);
    const margin = formatNumber(((sale - Number(price)) / sale) * 100, { maximumFractionDigits: 0 });
    return t('purchase_margin', { price: formatMoney(price, currency), margin });
  };

  return (
    <SectionCard title={t('references_title')} rightLink={{ label: t('edit'), href: `/products/${product.id}/edit` }}>
      <dl className="divide-y divide-border">
        <DetailRow label={t('sku')}>{show(shared((v) => v.sku || null))}</DetailRow>
        <DetailRow label={t('barcode')}>{show(shared((v) => v.barcode || null))}</DetailRow>
        <DetailRow label={t('unit')}>{unit ? tUnits(UNIT_NAMES[unit.value]) : show(null)}</DetailRow>
        <DetailRow label={t('purchase_price')}>{show(purchase, purchaseLabel)}</DetailRow>
      </dl>
    </SectionCard>
  );
}
