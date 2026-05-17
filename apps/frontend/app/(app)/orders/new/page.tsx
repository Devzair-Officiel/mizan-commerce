'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateOrder } from '@/lib/hooks/useOrders';
import { useCustomers } from '@/lib/hooks/useCustomers';
import { useProducts } from '@/lib/hooks/useProducts';

function NewOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync, isPending } = useCreateOrder();
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();

  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [shipping, setShipping] = useState('');
  const [items, setItems] = useState<{ product: string; product_name: string; quantity: number; unit_price: string }[]>([]);

  function addItem(productId: string) {
    const product = products?.results.find((p) => p.id === productId);
    if (!product) return;
    const existing = items.find((i) => i.product === productId);
    if (existing) {
      setItems(items.map((i) => i.product === productId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { product: productId, product_name: product.name, quantity: 1, unit_price: product.selling_price }]);
    }
  }

  function removeItem(productId: string) {
    setItems(items.filter((i) => i.product !== productId));
  }

  function updateQty(productId: string, qty: number) {
    if (qty < 1) { removeItem(productId); return; }
    setItems(items.map((i) => i.product === productId ? { ...i, quantity: qty } : i));
  }

  const subtotal = items.reduce((acc, i) => acc + parseFloat(i.unit_price) * i.quantity, 0);

  async function handleSubmit() {
    const order = await mutateAsync({
      customer: customerId || null,
      notes,
      discount_amount: discount || '0',
      shipping_amount: shipping || '0',
      items: items.map(({ product, quantity, unit_price }) => ({ product, quantity, unit_price })),
    });
    router.push(`/orders/${order.id}`);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Client */}
      <div className="flex flex-col gap-1.5">
        <Label>Client (optionnel)</Label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
        >
          <option value="">— Sans client —</option>
          {customers?.results.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Produits */}
      <div className="flex flex-col gap-2">
        <Label>Ajouter des articles</Label>
        <select
          onChange={(e) => { if (e.target.value) { addItem(e.target.value); e.target.value = ''; } }}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          defaultValue=""
        >
          <option value="" disabled>Sélectionner un produit…</option>
          {products?.results.filter((p) => p.is_active).map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.selling_price} €</option>
          ))}
        </select>
      </div>

      {/* Panier */}
      {items.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.product} className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-900 flex-1 truncate">{item.product_name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => updateQty(item.product, item.quantity - 1)} className="w-7 h-7 rounded border border-zinc-200 text-sm">−</button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <button onClick={() => updateQty(item.product, item.quantity + 1)} className="w-7 h-7 rounded border border-zinc-200 text-sm">+</button>
              </div>
              <span className="text-sm font-semibold text-zinc-900 w-16 text-right shrink-0">
                {(parseFloat(item.unit_price) * item.quantity).toFixed(2)} €
              </span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold text-zinc-900 pt-2 border-t border-zinc-100">
            <span>Sous-total</span><span>{subtotal.toFixed(2)} €</span>
          </div>
        </div>
      )}

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discount">Remise (€)</Label>
          <Input id="discount" type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shipping">Livraison (€)</Label>
          <Input id="shipping" type="number" step="0.01" min="0" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0.00" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notes internes…"
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
        />
      </div>

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        {isPending ? 'Création…' : 'Créer la commande'}
      </Button>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <>
      <TopBar title="Nouvelle commande" />
      <Suspense>
        <NewOrderForm />
      </Suspense>
    </>
  );
}
