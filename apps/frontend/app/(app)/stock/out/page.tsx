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

const MOVEMENT_TYPES = [
  { value: 'out', label: 'Sortie (vente manuelle)' },
  { value: 'loss', label: 'Perte / casse' },
];

function StockOutForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data: products } = useProducts();

  const [productId, setProductId] = useState(searchParams.get('product') ?? '');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [movementType, setMovementType] = useState('out');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!productId) { setError('Sélectionnez un produit.'); return; }
    if (!reason.trim()) { setError('La raison est obligatoire.'); return; }
    setIsPending(true);
    setError('');
    try {
      await apiFetch('/stock/out/', {
        method: 'POST',
        body: JSON.stringify({
          product: productId,
          quantity: parseInt(quantity, 10),
          reason,
          movement_type: movementType,
        }),
      });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    } catch {
      setError('Erreur lors de la sortie de stock.');
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
            <option key={p.id} value={p.id}>{p.name} (stock : {p.stock_quantity})</option>
          ))}
        </select>
      </div>

      {selectedProduct && (
        <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600">
          Stock actuel : <span className="font-semibold text-zinc-900">{selectedProduct.stock_quantity}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Type de mouvement</Label>
        <div className="flex gap-2">
          {MOVEMENT_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMovementType(value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                movementType === value
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quantity">Quantité *</Label>
        <Input
          id="quantity"
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Raison *</Label>
        <Input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Produit abîmé, vente directe…"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? 'Enregistrement…' : 'Enregistrer la sortie'}
      </Button>
    </div>
  );
}

export default function StockOutPage() {
  return (
    <>
      <TopBar title="Sortie stock" />
      <Suspense>
        <StockOutForm />
      </Suspense>
    </>
  );
}
