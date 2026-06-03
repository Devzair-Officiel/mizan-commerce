'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Trash2, StickyNote, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { FloatingTextarea } from '@/components/ui/floating-fields';
import { QuickAddCustomer, QuickAddProduct } from '@/components/orders/QuickAddDialogs';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import { ProductPicker, type FreeLine } from '@/components/orders/ProductPicker';
import { useCreateOrder, type OrderItemPayload } from '@/lib/hooks/useOrders';
import { useCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { useProducts, type ProductDetail, type ProductType } from '@/lib/hooks/useProducts';

type LineItem = {
  lineId: string;
  product: string | null;
  product_name: string;
  product_type: ProductType | null;
  quantity: number;
  unit_price: string;
};

function NewOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync, isPending } = useCreateOrder();
  const { data: products } = useProducts();

  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
  const [notes,      setNotes]      = useState('');
  const [discount,   setDiscount]   = useState('');
  const [shipping,   setShipping]   = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [itemsError, setItemsError] = useState(false);
  const [customerError, setCustomerError] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'partial' | 'paid'>('unpaid');
  const [amountPaid, setAmountPaid] = useState('');
  const [orderStatus, setOrderStatus] = useState<'draft' | 'to_prepare' | 'shipped'>('to_prepare');
  const [paymentError, setPaymentError] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [showShipping, setShowShipping] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const { data: selectedCustomer } = useCustomer(customerId);


  function addItem(productId: string) {
    const product = products?.results.find((p) => p.id === productId);
    if (!product) return;
    setItemsError(false);
    const existing = items.find((i) => i.product === productId);
    if (existing) {
      setItems(items.map((i) => i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, {
        lineId: crypto.randomUUID(),
        product: productId,
        product_name: product.name,
        product_type: product.type,
        quantity: 1,
        unit_price: product.selling_price,
      }]);
    }
  }

  function addFreeLine(line: FreeLine) {
    setItemsError(false);
    setItems((prev) => [...prev, {
      lineId: crypto.randomUUID(),
      product: null,
      product_name: line.product_name,
      product_type: null,
      quantity: line.quantity,
      unit_price: line.unit_price,
    }]);
  }

  function updateQty(lineId: string, qty: number) {
    if (qty < 1) { setItems(items.filter((i) => i.lineId !== lineId)); return; }
    setItems(items.map((i) => i.lineId === lineId ? { ...i, quantity: qty } : i));
  }

  function removeItem(lineId: string) {
    setItems(items.filter((i) => i.lineId !== lineId));
  }

  const subtotal  = items.reduce((acc, i) => acc + parseFloat(i.unit_price) * i.quantity, 0);
  const discountN = parseFloat(discount) || 0;
  const shippingN = parseFloat(shipping) || 0;
  const total     = subtotal - discountN + shippingN;

  const hasProducts = items.some((i) => i.product_type === 'product');
  const hasNonProducts = items.some((i) => i.product_type !== 'product');
  const toPrepareLabel = hasProducts && hasNonProducts
    ? 'À traiter'
    : hasNonProducts && !hasProducts
      ? 'Confirmée'
      : 'À préparer';

  async function handleSubmit() {
    setPaymentError('');
    let invalid = false;
    if (!customerId) { setCustomerError(true); invalid = true; }
    if (items.length === 0) { setItemsError(true); invalid = true; }
    if (invalid) return;
    if (paymentStatus === 'partial') {
      const n = parseFloat(amountPaid);
      if (!n || n <= 0) { setPaymentError('Saisis un montant reçu supérieur à 0.'); return; }
      if (n > total)    { setPaymentError('Le montant reçu ne peut pas dépasser le total.'); return; }
    }
    const payloadItems: OrderItemPayload[] = items.map((i) =>
      i.product
        ? { product: i.product, quantity: i.quantity, unit_price: i.unit_price }
        : { product_name: i.product_name, unit_price: i.unit_price, quantity: i.quantity },
    );
    const order = await mutateAsync({
      customer: customerId || null,
      notes,
      discount_amount: discount || '0',
      shipping_amount: shipping || '0',
      items: payloadItems,
      status: orderStatus,
      payment_status: paymentStatus,
      amount_paid: paymentStatus === 'partial' ? amountPaid : '0',
    });
    router.push(`/orders/${order.id}`);
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-32">

      {/* Client */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
          1 · Client
        </span>
        <CustomerPicker
          value={customerId}
          selectedCustomer={selectedCustomer}
          onChange={(id) => { setCustomerId(id); if (id) setCustomerError(false); }}
          onRequestCreate={() => setCreateCustomerOpen(true)}
        />
        <QuickAddCustomer
          hideTrigger
          open={createCustomerOpen}
          onOpenChange={setCreateCustomerOpen}
          onCreated={(c: Customer) => { setCustomerId(c.id); setCustomerError(false); }}
        />
        {customerError && (
          <p className="text-[11px] text-destructive px-1">Sélectionnez un client pour continuer.</p>
        )}
      </div>

      {/* Sélecteur d'article ou service */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
          2 · Articles &amp; services
        </span>
        <ProductPicker
          onPick={addItem}
          onFreeLine={addFreeLine}
          onRequestCreate={() => setCreateProductOpen(true)}
        />
        <QuickAddProduct
          hideTrigger
          open={createProductOpen}
          onOpenChange={setCreateProductOpen}
          onCreated={(p: ProductDetail) => addItem(p.id)}
        />
        {itemsError && (
          <p className="text-[11px] text-destructive px-1">Ajoutez au moins un article ou service.</p>
        )}
      </div>

      {/* Lignes ajoutées */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Articles &amp; services
            </span>
          </div>
          <div className="divide-y divide-border">
            {items.map((item) => {
              const unitPrice = parseFloat(item.unit_price);
              const lineTotal = unitPrice * item.quantity;
              return (
                <div key={item.lineId} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">{item.product_name}</span>
                        {item.product_type === 'service' && (
                          <span className="shrink-0 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                            Service
                          </span>
                        )}
                        {item.product === null && (
                          <span className="shrink-0 rounded-full bg-muted text-muted-foreground border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">
                            Libre
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {unitPrice.toFixed(2)} € / unité
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.lineId)}
                      aria-label="Supprimer"
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0 -mr-1 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQty(item.lineId, item.quantity - 1)}
                        aria-label="Diminuer"
                        className="w-9 h-9 rounded-full border border-border text-foreground text-base flex items-center justify-center active:bg-muted active:scale-95 transition-all"
                      >−</button>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.lineId, item.quantity + 1)}
                        aria-label="Augmenter"
                        className="w-9 h-9 rounded-full border border-border text-foreground text-base flex items-center justify-center active:bg-muted active:scale-95 transition-all"
                      >+</button>
                    </div>
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {lineTotal.toFixed(2)} €
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Résumé */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Résumé</span>
          </div>
          <div className="flex flex-col">
            <SummaryRow label="Sous-total">
              <span className="text-sm font-medium text-foreground tabular-nums">{subtotal.toFixed(2)} €</span>
            </SummaryRow>
            {(showDiscount || discountN > 0) && (
              <SummaryRow label="Remise">
                <SummaryAmountInput
                  value={discount}
                  onChange={setDiscount}
                  ariaLabel="Remise"
                  onClear={() => { setDiscount(''); setShowDiscount(false); }}
                />
              </SummaryRow>
            )}
            {(showShipping || shippingN > 0) && (
              <SummaryRow label="Frais">
                <SummaryAmountInput
                  value={shipping}
                  onChange={setShipping}
                  ariaLabel="Frais"
                  onClear={() => { setShipping(''); setShowShipping(false); }}
                />
              </SummaryRow>
            )}
            {(!showDiscount && discountN === 0) || (!showShipping && shippingN === 0) ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-border">
                {!showDiscount && discountN === 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDiscount(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    + Ajouter une remise
                  </button>
                )}
                {!showShipping && shippingN === 0 && (
                  <button
                    type="button"
                    onClick={() => setShowShipping(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    + Ajouter des frais
                  </button>
                )}
              </div>
            ) : null}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="text-base font-bold text-foreground tabular-nums">{total.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      )}

      {/* Paiement */}
      <SectionChips
        title="Paiement"
        options={[
          { value: 'unpaid',  label: 'Non payé', activeClass: 'bg-red-500 text-white' },
          { value: 'partial', label: 'Partiel',  activeClass: 'bg-amber-500 text-white' },
          { value: 'paid',    label: 'Payé',     activeClass: 'bg-green-600 text-white' },
        ]}
        value={paymentStatus}
        onChange={(v) => { setPaymentStatus(v as 'unpaid' | 'partial' | 'paid'); setPaymentError(''); }}
      >
        {paymentStatus === 'partial' && (
          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor="amount-paid" className="text-xs font-medium text-muted-foreground">
              Montant reçu
            </label>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background focus-within:border-primary transition-colors w-fit">
              <input
                id="amount-paid"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={amountPaid}
                onChange={(e) => { setAmountPaid(e.target.value); setPaymentError(''); }}
                className="w-28 bg-transparent text-right text-sm font-medium tabular-nums px-2 py-1.5 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-sm text-muted-foreground pr-2">€</span>
            </div>
            {paymentError && (
              <p className="text-[11px] text-destructive px-1">{paymentError}</p>
            )}
          </div>
        )}
      </SectionChips>

      {/* Statut initial */}
      <SectionChips
        title="Statut initial"
        options={[
          { value: 'draft',      label: 'Brouillon',    activeClass: 'bg-zinc-500 text-white' },
          { value: 'to_prepare', label: toPrepareLabel, activeClass: 'bg-blue-600 text-white' },
          { value: 'shipped',    label: 'Expédiée',     activeClass: 'bg-green-600 text-white' },
        ]}
        value={orderStatus}
        onChange={(v) => setOrderStatus(v as 'draft' | 'to_prepare' | 'shipped')}
      />

      {/* Notes — repliable */}
      {showNotes || notes ? (
        <div className="relative">
          <FloatingTextarea
            id="notes"
            label="Notes internes (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            autoFocus={showNotes && !notes}
          />
          {!notes && (
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              aria-label="Masquer les notes"
              className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="self-start flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
        >
          <StickyNote size={16} />
          <span>Ajouter une note interne</span>
        </button>
      )}

      {/* CTA sticky en bas */}
      <div className="fixed bottom-20 left-0 right-0 lg:left-60 lg:bottom-0 z-30 px-4 pt-4 pb-3 bg-linear-to-t from-background via-background/95 to-transparent pointer-events-none">
        <Button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full pointer-events-auto shadow-[0_8px_20px_-6px_rgba(0,0,0,0.22)]"
        >
          {isPending ? (
            'Création…'
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>Créer la commande</span>
              {items.length > 0 && (
                <>
                  <span className="opacity-60">·</span>
                  <span className="tabular-nums font-semibold">{total.toFixed(2)} €</span>
                </>
              )}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

function SectionChips({
  title,
  options,
  value,
  onChange,
  children,
}: {
  title: string;
  options: { value: string; label: string; activeClass?: string }[];
  value: string;
  onChange: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        {title}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map(({ value: v, label, activeClass }) => {
          const active = value === v;
          const activeStyle = activeClass ?? 'bg-primary text-primary-foreground';
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              aria-pressed={active}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                active
                  ? activeStyle
                  : 'bg-muted text-muted-foreground active:bg-muted/70'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SummaryAmountInput({
  value,
  onChange,
  ariaLabel,
  onClear,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-background focus-within:border-primary transition-colors">
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0,00"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={!value}
          className="w-20 bg-transparent text-right text-sm font-medium tabular-nums px-2 py-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-sm text-muted-foreground pr-2">€</span>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Retirer ${ariaLabel.toLowerCase()}`}
          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          <X size={14} />
        </button>
      )}
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
