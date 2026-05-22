'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelect } from '@/components/ui/floating-fields';
import { apiFetch } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts } from '@/lib/hooks/useProducts';

function StockAddForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data: products } = useProducts();

  const [productId, setProductId] = useState(searchParams.get('product') ?? '');
  const [quantity,  setQuantity]  = useState('1');
  const [reason,    setReason]    = useState('Réassort');
  const [isPending, setIsPending] = useState(false);
  const [error,     setError]     = useState('');

  const selectedProduct = products?.results.find((p) => p.id === productId);

  async function handleSubmit() {
    if (!productId) { setError('Sélectionnez un produit.'); return; }
    setIsPending(true); setError('');
    try {
      await apiFetch('/stock/in/', {
        method: 'POST',
        body: JSON.stringify({ product: productId, quantity: parseInt(quantity, 10), reason }),
      });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    } catch {
      setError("Erreur lors de l'ajout de stock.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-8">

      <FloatingSelect
        id="product"
        label="Produit *"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
      >
        <option value="">Sélectionner un produit…</option>
        {products?.results.filter((p) => p.is_active).map((p) => (
          <option key={p.id} value={p.id}>{p.name} (stock actuel : {p.stock_quantity})</option>
        ))}
      </FloatingSelect>

      {selectedProduct && (
        <div className="rounded-2xl bg-muted/60 border border-border px-4 py-3 text-sm text-muted-foreground">
          Stock actuel : <span className="font-semibold text-foreground">{selectedProduct.stock_quantity}</span>
        </div>
      )}

      <FloatingInput
        id="quantity"
        label="Quantité à ajouter *"
        type="number"
        min="1"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />

      <FloatingInput
        id="reason"
        label="Raison (optionnel)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error && <p className="text-[11px] text-destructive px-1">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full mt-1">
        {isPending ? 'Enregistrement…' : 'Ajouter au stock'}
      </Button>
    </div>
  );
}

export default function StockAddPage() {
  return (
    <>
      <TopBar title="Entrée stock" />
      <Suspense><StockAddForm /></Suspense>
    </>
  );
}
