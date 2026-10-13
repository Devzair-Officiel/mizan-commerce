'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ProductForm } from '@/components/products/form/ProductForm';
import { useSaveProduct } from '@/components/products/form/useSaveProduct';
import type { ProductFormValues } from '@/components/products/form/productFormSchema';
import type { PhotoChanges } from '@/components/products/form/useProductPhotos';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { useProduct } from '@/lib/hooks/useProducts';
import { useShop } from '@/lib/hooks/useShop';

export default function EditProductPage() {
  const t = useTranslations('articles.form');
  const tDetail = useTranslations('articles.detail');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // « Gérer les photos » depuis la fiche : `?focus=photos`.
  const focusPhotos = useSearchParams().get('focus') === 'photos';
  const formatDate = useFormatDate();
  const back = useBackOr(`/products/${id}`);
  const { data: product, isLoading } = useProduct(id);
  const { data: shop } = useShop();
  const { update, saving } = useSaveProduct();

  if (!product || !shop) {
    return (
      <div className="mx-auto w-full max-w-280">
        <TopBar title={t('title_edit', { type: product?.type ?? 'product' })} back onBack={back} hideSearch />
        {isLoading || !shop
          ? <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
          : <p className="p-4 text-sm text-destructive">{tDetail('not_found', { type: 'other' })}</p>}
      </div>
    );
  }

  async function handleSubmit(values: ProductFormValues, photos: PhotoChanges | null) {
    if (!product) return true;
    const { complete } = await update(product, values, photos);
    // Remplace le formulaire dans l'historique : « retour » depuis la fiche ne le rouvre pas.
    router.replace(`/products/${id}`);
    return complete;
  }

  const subtitle = t('subtitle_edit', { type: product.type, date: formatDate(product.created_at, { day: 'numeric', month: 'long', year: 'numeric' }) });
  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('title_edit', { type: product.type })} subtitle={subtitle} back backLabel={product.name} onBack={back} hideSearch />
      <ProductForm mode="edit" type={product.type} mixed={shop.catalog_kind === 'both'} currencyCode={shop.currency}
        product={product} onSubmit={handleSubmit} isSubmitting={saving} onLeave={back} focusPhotos={focusPhotos} />
    </div>
  );
}
