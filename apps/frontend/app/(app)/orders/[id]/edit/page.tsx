'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingInput, FloatingSelectBase, FloatingSelectItem, FloatingTextarea } from '@/components/ui/floating-fields';
import { QuickAddCustomer, QuickAddProduct } from '@/components/orders/QuickAddDialogs';
import {
  useOrder,
  useUpdateOrder,
  useAddOrderItem,
  useUpdateOrderItem,
  useRemoveOrderItem,
} from '@/lib/hooks/useOrders';
import { useCustomers, type Customer } from '@/lib/hooks/useCustomers';
import { useProducts, type ProductDetail } from '@/lib/hooks/useProducts';

interface EditItem {
  id?: string;
  product: string;
  product_name: string;
  quantity: number;
  unit_price: string;
}

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  const { data: customers } = useCustomers();
  const { data: products }  = useProducts();

  const updateOrder  = useUpdateOrder(id);
  const addItem      = useAddOrderItem(id);
  const updateItem   = useUpdateOrderItem(id);
  const removeItem   = useRemoveOrderItem(id);

  const [customerId,  setCustomerId]  = useState('');
  const [notes,       setNotes]       = useState('');
  const [discount,    setDiscount]    = useState('');
  const [shipping,    setShipping]    = useState('');
  const [items,       setItems]       = useState<EditItem[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!order) return;
    setCustomerId(order.customer ?? '');
    setNotes(order.notes ?? '');
    setDiscount(order.discount_amount ?? '0');
    setShipping(order.shipping_amount ?? '0');
    const mapped = order.items.map((i) => ({
      id: i.id, product: i.product, product_name: i.product_name,
      quantity: i.quantity, unit_price: i.unit_price,
    }));
    setItems(mapped);
    setOriginalIds(new Set(order.items.map((i) => i.id)));
  }, [order]);

  function addProduct(productId: string) {
    const product = products?.results.find((p) => p.id === productId);
    if (!product) return;
    const existing = items.find((i) => i.product === productId);
    if (existing) {
      setItems(items.map((i) => i.product === productId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, { product: productId, product_name: product.name, quantity: 1, unit_price: product.selling_price }]);
    }
  }

  function updateQty(product: string, qty: number) {
    if (qty < 1) { setItems(items.filter((i) => i.product !== product)); return; }
    setItems(items.map((i) => i.product === product ? { ...i, quantity: qty } : i));
  }

  const subtotal  = items.reduce((acc, i) => acc + parseFloat(i.unit_price) * i.quantity, 0);
  const discountN = parseFloat(discount) || 0;
  const shippingN = parseFloat(shipping) || 0;
  const total     = subtotal - discountN + shippingN;
  const isPending = updateOrder.isPending || addItem.isPending || updateItem.isPending || removeItem.isPending;

  async function handleSave() {
    await updateOrder.mutateAsync({
      customer: customerId || null, notes,
      discount_amount: discount || '0', shipping_amount: shipping || '0',
    });
    const currentIds = new Set(items.filter((i) => i.id).map((i) => i.id as string));
    await Promise.all([...originalIds].filter((id) => !currentIds.has(id)).map((itemId) => removeItem.mutateAsync(itemId)));
    await Promise.all(items.filter((i) => {
      if (!i.id) return false;
      return order?.items.find((o) => o.id === i.id)?.quantity !== i.quantity;
    }).map((i) => updateItem.mutateAsync({ itemId: i.id!, quantity: i.quantity })));
    await Promise.all(items.filter((i) => !i.id).map((i) => addItem.mutateAsync({ product: i.product, quantity: i.quantity, unit_price: i.unit_price })));
    router.push(`/orders/${id}`);
  }

  if (isLoading) return <><TopBar title="Modifier la commande" /><p className="p-4 text-sm text-muted-foreground">Chargement…</p></>;
  if (!order)    return <><TopBar title="Modifier la commande" /><p className="p-4 text-sm text-destructive">Commande introuvable.</p></>;
  if (order.status !== 'draft') return (
    <>
      <TopBar title="Modifier la commande" />
      <p className="p-4 text-sm text-muted-foreground">Seules les commandes en brouillon peuvent être modifiées.</p>
    </>
  );

  return (
    <>
      <TopBar title={`Modifier ${order.order_number}`} action={
        <Button size="sm" onClick={handleSave} disabled={isPending || items.length === 0}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      } />

      <div className="flex flex-col gap-3 p-4 pb-8">

        <div className="flex gap-2">
          <div className="flex-1">
            <FloatingSelectBase
              id="customer"
              label="Client (optionnel)"
              value={customerId}
              onValueChange={setCustomerId}
              placeholder="— Sans client —"
            >
              <FloatingSelectItem value="">— Sans client —</FloatingSelectItem>
              {customers?.results.map((c) => (
                <FloatingSelectItem key={c.id} value={c.id}>{c.name}</FloatingSelectItem>
              ))}
            </FloatingSelectBase>
          </div>
          <QuickAddCustomer onCreated={(c: Customer) => setCustomerId(c.id)} />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <FloatingSelectBase
              id="product-picker"
              label="Ajouter un article"
              value=""
              onValueChange={(v) => { if (v) addProduct(v); }}
              placeholder="Choisir un produit…"
            >
              {products?.results.filter((p) => p.is_active).map((p) => (
                <FloatingSelectItem key={p.id} value={p.id}>{p.name} — {p.selling_price} €</FloatingSelectItem>
              ))}
            </FloatingSelectBase>
          </div>
          <QuickAddProduct onCreated={(p: ProductDetail) => addProduct(p.id)} />
        </div>

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
                    <button onClick={() => updateQty(item.product, item.quantity - 1)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center active:bg-muted">−</button>
                    <span className="w-5 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                    <button onClick={() => updateQty(item.product, item.quantity + 1)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center active:bg-muted">+</button>
                  </div>
                  <span className="text-sm font-semibold text-foreground w-16 text-right tabular-nums shrink-0">
                    {(parseFloat(item.unit_price) * item.quantity).toFixed(2)} €
                  </span>
                </div>
              ))}
            </div>
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

        <div className="grid grid-cols-2 gap-3">
          <FloatingInput id="discount" label="Remise (€, optionnel)" type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <FloatingInput id="shipping" label="Livraison (€, optionnel)" type="number" step="0.01" min="0" value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </div>

        <FloatingTextarea id="notes" label="Notes internes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
    </>
  );
}
