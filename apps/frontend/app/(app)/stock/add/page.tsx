'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts } from '@/lib/hooks/useProducts';

function StockAddForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data: products } = useProducts();

  const [productId, setProductId] = useState(searchParams.get('product') ?? '');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Réassort');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!productId) { setError('Sélectionnez un produit.'); return; }
    setIsPending(true);
    setError('');
    try {
      await apiFetch('/stock/in/', {
        method: 'POST',
        body: JSON.stringify({ product: productId, quantity: parseInt(quantity, 10), reason }),
      });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    } catch {
      setError('Erreur lors de l\'ajout de stock.');
    } finally {
      setIsPending(false);
    }
  }

  const selectedProduct = products?.results.find((p) => p.id === productId);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1.5">
        <Label>Produit *</Label>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">Sélectionner un produit…</option>
          {products?.results.filter((p) => p.is_active).map((p) => (
            <option key={p.id} value={p.id}>{p.name} (stock actuel : {p.stock_quantity})</option>
          ))}
        </select>
      </div>

      {selectedProduct && (
        <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600">
          Stock actuel : <span className="font-semibold text-zinc-900">{selectedProduct.stock_quantity}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quantity">Quantité à ajouter *</Label>
        <Input
          id="quantity"
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Raison</Label>
        <Input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Réassort fournisseur"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? 'Enregistrement…' : 'Ajouter au stock'}
      </Button>
    </div>
  );
}

export default function StockAddPage() {
  return (
    <>
      <TopBar title="Entrée stock" />
      <Suspense>
        <StockAddForm />
      </Suspense>
    </>
  );
}
