'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ProductForm } from '@/components/products/form/ProductForm';
import { useSaveProduct } from '@/components/products/form/useSaveProduct';
import type { ProductFormValues } from '@/components/products/form/useProductForm';
import { useBackOr } from '@/lib/hooks/useBackOr';
import type { ProductType } from '@/lib/hooks/useProducts';
import { useShop } from '@/lib/hooks/useShop';

function NewProductContent() {
  const t = useTranslations('articles.form');
  const tList = useTranslations('articles.list');
  const router = useRouter();
  const searchParams = useSearchParams();
  const back = useBackOr('/products');
  const { data: shop } = useShop();
  const { create, saving } = useSaveProduct();
  const kind = shop?.catalog_kind ?? 'both';
  // Boutique mixte : `?type=service` (recherche rapide) présélectionne le service.
  const type: ProductType = kind === 'services' || (kind === 'both' && searchParams.get('type') === 'service') ? 'service' : 'product';

  async function handleSubmit(values: ProductFormValues, photo: File | null) {
    const { id, complete } = await create(values, photo);
    router.replace(`/products/${id}`);
    return complete;
  }

  return (
    <div className="mx-auto w-full max-w-198">
      <TopBar title={t('title_new', { kind })} back backLabel={tList('title', { kind })} onBack={back} hideSearch />
      {shop ? (
        <ProductForm mode="create" type={type} mixed={kind === 'both'} currencyCode={shop.currency} variant={null}
          onSubmit={handleSubmit} isSubmitting={saving} onLeave={back} />
      ) : (
        <div className="mx-4 h-96 animate-pulse rounded-2xl bg-muted" />
      )}
    </div>
  );
}

export default function NewProductPage() {
  return (
    <Suspense>
      <NewProductContent />
    </Suspense>
  );
}
