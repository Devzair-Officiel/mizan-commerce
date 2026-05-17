'use client';

import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { ProductForm } from '@/components/products/ProductForm';
import { useProduct, useUpdateProduct } from '@/lib/hooks/useProducts';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const { mutateAsync, isPending } = useUpdateProduct(id);

  async function handleSubmit(data: Parameters<typeof mutateAsync>[0]) {
    await mutateAsync(data);
    router.push(`/products/${id}`);
  }

  if (isLoading) return <><TopBar title="Modifier" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;

  return (
    <>
      <TopBar title="Modifier le produit" />
      <ProductForm defaultValues={product} onSubmit={handleSubmit} isSubmitting={isPending} />
    </>
  );
}
