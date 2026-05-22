'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, PackageMinus, PackagePlus, PowerOff, Power } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { useProduct, useDeactivateProduct, useReactivateProduct, useUploadProductImage } from '@/lib/hooks/useProducts';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const deactivate = useDeactivateProduct();
  const reactivate = useReactivateProduct();
  const uploadImage = useUploadProductImage(id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await uploadImage.mutateAsync(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erreur lors de l\'upload.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeactivate() {
    if (!confirm('Désactiver ce produit ?')) return;
    await deactivate.mutateAsync(id);
    router.push('/products');
  }

  if (isLoading) return <><TopBar title="Produit" /><p className="p-4 text-sm text-zinc-400">Chargement…</p></>;
  if (!product) return <><TopBar title="Produit" /><p className="p-4 text-sm text-red-500">Produit introuvable.</p></>;

  return (
    <>
      <TopBar title={product.name} />
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

        {/* Photo */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Photo produit</p>
          {product.images.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {product.images.map((img) => (
                <div key={img.id} className="relative w-20 h-20 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200">
                  <span className="text-xs text-zinc-400 flex items-center justify-center h-full">{img.is_primary ? 'Principale' : '+'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Aucune photo.</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadImage.isPending}
          >
            {uploadImage.isPending ? 'Envoi…' : '+ Ajouter une photo'}
          </Button>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Link href={`/products/${id}/edit`}>
            <Button className="w-full">
              <Pencil size={18} />
              Modifier le produit
            </Button>
          </Link>
          <Link href={`/stock/add?product=${id}`}>
            <Button variant="outline" className="w-full">
              <PackagePlus size={18} />
              Entrée stock
            </Button>
          </Link>
          <Link href={`/stock/out?product=${id}`}>
            <Button variant="outline" className="w-full text-amber-600 border-amber-200">
              <PackageMinus size={18} />
              Sortie stock
            </Button>
          </Link>
          {product.is_active ? (
            <Button
              variant="outline"
              className="w-full text-red-500 border-red-200"
              onClick={handleDeactivate}
              disabled={deactivate.isPending}
            >
              <PowerOff size={18} />
              Désactiver le produit
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full text-green-600 border-green-200"
              onClick={() => reactivate.mutateAsync(id)}
              disabled={reactivate.isPending}
            >
              <Power size={18} />
              {reactivate.isPending ? 'Réactivation…' : 'Réactiver le produit'}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
