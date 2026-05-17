'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useProduct, useDeactivateProduct } from '@/lib/hooks/useProducts';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const deactivate = useDeactivateProduct();

  async function handleDeactivate() {
    if (!confirm('Désactiver ce produit ?')) return;
    await deactivate.mutateAsync(id);
    router.push('/products');
  }

  if (isLoading) return <><TopBar title="Produit" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;
  if (!product) return <><TopBar title="Produit" /><p className="p-4 text-sm text-red-500">Produit introuvable.</p></>;

  return (
    <>
      <TopBar
        title={product.name}
        action={
          <Link href={`/products/${id}/edit`}>
            <Button variant="outline" size="sm">Modifier</Button>
          </Link>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {/* Stock */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-400 mb-1">Stock actuel</p>
          <p className={`text-3xl font-bold ${product.is_out_of_stock ? 'text-red-500' : product.is_low_stock ? 'text-amber-500' : 'text-zinc-900'}`}>
            {product.stock_quantity}
          </p>
          {product.is_out_of_stock && <p className="text-xs text-red-500 mt-1">Rupture de stock</p>}
          {product.is_low_stock && !product.is_out_of_stock && (
            <p className="text-xs text-amber-500 mt-1">Stock faible (seuil : {product.low_stock_threshold})</p>
          )}
        </div>

        {/* Prix */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-zinc-400">Prix de vente</p>
            <p className="text-lg font-semibold text-zinc-900">{product.selling_price} €</p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Prix d'achat</p>
            <p className="text-lg font-semibold text-zinc-900">{product.purchase_price} €</p>
          </div>
        </div>

        {/* Infos */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3">
          {product.reference && (
            <div>
              <p className="text-xs text-zinc-400">Référence</p>
              <p className="text-sm text-zinc-900">{product.reference}</p>
            </div>
          )}
          {product.description && (
            <div>
              <p className="text-xs text-zinc-400">Description</p>
              <p className="text-sm text-zinc-900">{product.description}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-400">Statut</p>
            <p className="text-sm text-zinc-900">{product.is_active ? 'Actif' : 'Inactif'}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Link href={`/stock/add?product=${id}`}>
            <Button variant="outline" className="w-full">+ Entrée stock</Button>
          </Link>
          <Link href={`/stock/out?product=${id}`}>
            <Button variant="outline" className="w-full text-amber-600 border-amber-200">− Sortie stock</Button>
          </Link>
          {product.is_active && (
            <Button
              variant="outline"
              className="w-full text-red-500 border-red-200"
              onClick={handleDeactivate}
              disabled={deactivate.isPending}
            >
              Désactiver le produit
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
