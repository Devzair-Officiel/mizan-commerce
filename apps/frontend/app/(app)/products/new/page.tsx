'use client';

import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { ProductForm } from '@/components/products/ProductForm';
import { useCreateProduct } from '@/lib/hooks/useProducts';

export default function NewProductPage() {
  const router = useRouter();
  const { mutateAsync, isPending } = useCreateProduct();

  async function handleSubmit(data: Parameters<typeof mutateAsync>[0]) {
    const product = await mutateAsync(data);
    router.push(`/products/${product.id}`);
  }

  return (
    <>
      <TopBar title="Nouveau produit" />
      <ProductForm onSubmit={handleSubmit} isSubmitting={isPending} />
    </>
  );
}
