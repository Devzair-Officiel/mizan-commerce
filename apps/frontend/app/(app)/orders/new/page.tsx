'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelectBase, FloatingSelectItem, FloatingTextarea } from '@/components/ui/floating-fields';
import { QuickAddCustomer, QuickAddProduct } from '@/components/orders/QuickAddDialogs';
import { useCreateOrder } from '@/lib/hooks/useOrders';
import { useCustomers, type Customer } from '@/lib/hooks/useCustomers';
import { useProducts, type ProductDetail } from '@/lib/hooks/useProducts';

function NewOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync, isPending } = useCreateOrder();
  const { data: customers } = useCustomers();
  const { data: products } = useProducts();

  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
  const [notes,      setNotes]      = useState('');
  const [discount,   setDiscount]   = useState('');
  const [shipping,   setShipping]   = useState('');
  const [items, setItems] = useState<{ product: string; product_name: string; quantity: number; unit_price: string }[]>([]);
  const [itemsError, setItemsError] = useState(false);

  function addItem(productId: string) {
    const product = products?.results.find((p) => p.id === productId);
    if (!product) return;
    setItemsError(false);
    const existing = items.find((i) => i.product === productId);
    if (existing) {
      setItems(items.map((i) => i.product === productId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { product: productId, product_name: product.name, quantity: 1, unit_price: product.selling_price }]);
    }
  }

  function updateQty(productId: string, qty: number) {
    if (qty < 1) { setItems(items.filter((i) => i.product !== productId)); return; }
    setItems(items.map((i) => i.product === productId ? { ...i, quantity: qty } : i));
  }

  const subtotal  = items.reduce((acc, i) => acc + parseFloat(i.unit_price) * i.quantity, 0);
  const discountN = parseFloat(discount) || 0;
  const shippingN = parseFloat(shipping) || 0;
  const total     = subtotal - discountN + shippingN;

  async function handleSubmit() {
    if (items.length === 0) { setItemsError(true); return; }
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
    <div className="flex flex-col gap-3 p-4 pb-8">

      {/* Client */}
      <div className="flex gap-2">
        <div className="flex-1">
          <FloatingSelectBase
            id="customer"
            label="Client (optionnel)"
            value={customerId}
            onValueChange={setCustomerId}
            placeholder="— Sans client —"
            selectItems={customers?.results.map((c) => ({ value: c.id, label: c.name }))}
          >
            <FloatingSelectItem value="">— Sans client —</FloatingSelectItem>
            {customers?.results.map((c) => (
              <FloatingSelectItem key={c.id} value={c.id}>{c.name}</FloatingSelectItem>
            ))}
          </FloatingSelectBase>
        </div>
        <QuickAddCustomer onCreated={(c: Customer) => setCustomerId(c.id)} />
      </div>

      {/* Sélecteur de produit */}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <div className="flex-1">
            <FloatingSelectBase
              id="product-picker"
              label={<>Ajouter un article <span className="text-destructive">*</span></>}
              value=""
              onValueChange={(v) => { if (v) addItem(v); }}
              placeholder="Choisir un produit…"
              selectItems={products?.results.filter((p) => p.is_active).map((p) => ({ value: p.id, label: `${p.name} — ${p.selling_price} €` }))}
            >
              {products?.results.filter((p) => p.is_active).map((p) => (
                <FloatingSelectItem key={p.id} value={p.id}>{p.name} — {p.selling_price} €</FloatingSelectItem>
              ))}
            </FloatingSelectBase>
          </div>
          <QuickAddProduct onCreated={(p: ProductDetail) => addItem(p.id)} />
        </div>
        {itemsError && (
          <p className="text-[11px] text-destructive px-1">Ajoutez au moins un article.</p>
        )}
      </div>

      {/* Panier */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Articles</span>
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.product} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm font-medium text-foreground flex-1 truncate">{item.product_name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateQty(item.product, item.quantity - 1)}
                    className="w-7 h-7 rounded-full border border-border text-foreground text-base flex items-center justify-center active:bg-muted"
                  >−</button>
                  <span className="w-5 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product, item.quantity + 1)}
                    className="w-7 h-7 rounded-full border border-border text-foreground text-base flex items-center justify-center active:bg-muted"
                  >+</button>
                </div>
                <span className="text-sm font-semibold text-foreground w-16 text-right tabular-nums shrink-0">
                  {(parseFloat(item.unit_price) * item.quantity).toFixed(2)} €
                </span>
              </div>
            ))}
          </div>
          {/* Récapitulatif */}
          <div className="px-4 py-3 bg-muted/40 flex flex-col gap-1 border-t border-border">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Sous-total</span><span className="tabular-nums">{subtotal.toFixed(2)} €</span>
            </div>
            {discountN > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Remise</span><span className="tabular-nums">− {discountN.toFixed(2)} €</span>
              </div>
            )}
            {shippingN > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Livraison</span><span className="tabular-nums">+ {shippingN.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border mt-0.5">
              <span>Total</span><span className="tabular-nums">{total.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      )}

      {/* Remise / Livraison */}
      <div className="grid grid-cols-2 gap-3">
        <FloatingInput
          id="discount"
          label="Remise (€, optionnel)"
          type="number"
          step="0.01"
          min="0"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
        <FloatingInput
          id="shipping"
          label="Livraison (€, optionnel)"
          type="number"
          step="0.01"
          min="0"
          value={shipping}
          onChange={(e) => setShipping(e.target.value)}
        />
      </div>

      {/* Notes */}
      <FloatingTextarea
        id="notes"
        label="Notes internes (optionnel)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
      />

      <Button onClick={handleSubmit} disabled={isPending} className="w-full mt-1">
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
