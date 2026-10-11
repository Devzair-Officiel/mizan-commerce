'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { ProductSalesRow } from './ProductSalesRow';

/** Carte « Ventes sur 30 jours » d'un service (pas de stock à suivre). */
export function ProductSalesCard({ product, currency }: { product: ProductDetail; currency: string }) {
  const t = useTranslations('articles.sheet');
  return (
    <SectionCard title={t('sales_title')}>
      <dl><ProductSalesRow product={product} currency={currency} label={t('sold_30d_service')} /></dl>
    </SectionCard>
  );
}
