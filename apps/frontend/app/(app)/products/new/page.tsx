'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ProductForm, type ProductFormExtras, type ProductFormSubmission } from '@/components/products/ProductForm';
import { apiFetch } from '@/lib/api-client';
import {
  useCreateProduct,
  type ProductType,
  type ProductVariant,
} from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';

function NewProductForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const tForm = useTranslations('articles.form');
  const tDetail = useTranslations('articles.detail');
  const rawType = searchParams.get('type');
  const type: ProductType = rawType === 'service' ? 'service' : 'product';

  const { mutateAsync, isPending } = useCreateProduct();
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleSubmit(submission: ProductFormSubmission, extras: ProductFormExtras) {
    const product = await mutateAsync({ ...submission.product, type });

    setIsProcessing(true);
    try {
      if (!submission.variant) throw new Error(tDetail('no_default_variant'));
      const defaultVariant = await apiFetch<ProductVariant>(`/products/${product.id}/variants/`, {
        method: 'POST',
        body: JSON.stringify(submission.variant),
      });

      if (extras.image) {
        const formData = new FormData();
        formData.append('image', extras.image);
        await fetch(`/api/proxy/products/${product.id}/images/`, {
          method: 'POST',
          body: formData,
        });
      }
      if (extras.initialStock) {
        await apiFetch('/stock/in/', {
          method: 'POST',
          body: JSON.stringify({
            variant: defaultVariant.id,
            quantity: extras.initialStock,
            reason: tDetail('initial_stock_reason'),
          }),
        });
      }
      qc.invalidateQueries({ queryKey: qk.products.all });
    } finally {
      setIsProcessing(false);
    }

    router.push(`/products/${product.id}`);
  }

  return (
    <>
      <TopBar title={type === 'service' ? tForm('topbar_new_service') : tForm('topbar_new_product')} />
      <ProductForm
        type={type}
        onSubmit={handleSubmit}
        isSubmitting={isPending || isProcessing}
      />
    </>
  );
}

export default function NewProductPage() {
  return (
    <Suspense>
      <NewProductForm />
    </Suspense>
  );
}
