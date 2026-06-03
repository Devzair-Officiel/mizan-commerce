'use client';

import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { ProductForm, type ProductFormSubmission } from '@/components/products/ProductForm';
import { useProduct, useUpdateProduct } from '@/lib/hooks/useProducts';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const { mutateAsync, isPending } = useUpdateProduct(id);

  async function handleSubmit(submission: ProductFormSubmission) {
    await mutateAsync(submission.product);
    router.push(`/products/${id}`);
  }

  if (isLoading || !product) return <><TopBar title="Modifier" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;

  return (
    <>
      <TopBar title={product.type === 'service' ? 'Modifier le service' : 'Modifier le produit'} />
      <ProductForm
        type={product.type}
        defaultValues={product}
        isEditing
        onSubmit={handleSubmit}
        isSubmitting={isPending}
      />
    </>
  );
}
