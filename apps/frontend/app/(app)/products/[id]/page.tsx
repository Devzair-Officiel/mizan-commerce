'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ProductDetailView } from '@/components/products/detail/ProductDetailView';
import { useProduct } from '@/lib/hooks/useProducts';

export default function ProductDetailPage() {
  const t = useTranslations('articles.sheet');
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useProduct(id);

  if (isLoading) return <><TopBar title={t('topbar')} back hideSearch /><p className="p-4 text-sm text-muted-foreground">{t('loading')}</p></>;
  if (!product) return <><TopBar title={t('topbar')} back hideSearch /><p className="p-4 text-sm text-destructive">{t('not_found')}</p></>;
  // `key` : fenêtres et confirmations repartent à zéro d'un article à l'autre.
  return <ProductDetailView key={product.id} product={product} />;
}
