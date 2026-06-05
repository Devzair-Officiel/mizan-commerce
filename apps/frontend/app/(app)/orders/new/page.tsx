'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { QuickAddCustomer, QuickAddProduct } from '@/components/orders/QuickAddDialogs';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import { ProductPicker, type FreeLine, type VariantPick } from '@/components/orders/ProductPicker';
import { OrderItemsList } from '@/components/orders/new/OrderItemsList';
import { OrderSummary } from '@/components/orders/new/OrderSummary';
import { SectionChips } from '@/components/orders/new/SectionChips';
import { NotesSection } from '@/components/orders/new/NotesSection';
import { PaymentPartialInput } from '@/components/orders/new/PaymentPartialInput';
import { SubmitCTA } from '@/components/orders/new/SubmitCTA';
import type { LineItem } from '@/components/orders/new/types';
import { useCreateOrder, type OrderItemPayload } from '@/lib/hooks/useOrders';
import { useCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { apiFetch } from '@/lib/api-client';
import type { ProductDetail } from '@/lib/hooks/useProducts';

function NewOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutateAsync, isPending } = useCreateOrder();

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

  function addItem(pick: VariantPick) {
    setItemsError(false);
    const existing = items.find((i) => i.variant === pick.variantId);
    if (existing) {
      setItems(items.map((i) => i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, {
        lineId: crypto.randomUUID(),
        variant: pick.variantId,
        product_name: pick.productName,
        variant_name: pick.variantName,
        product_type: pick.productType,
        quantity: 1,
        unit_price: pick.unitPrice,
      }]);
    }
  }

  async function addProductFromQuickAdd(productId: string) {
    const detail = await apiFetch<ProductDetail>(`/products/${productId}/`);
    const first = detail.variants.find((v) => v.is_active);
    if (!first) return;
    addItem({
      variantId: first.id,
      productName: detail.name,
      variantName: first.packaging_name,
      productType: detail.type,
      unitPrice: first.selling_price,
    });
  }

  function addFreeLine(line: FreeLine) {
    setItemsError(false);
    setItems((prev) => [...prev, {
      lineId: crypto.randomUUID(),
      variant: null,
      product_name: line.product_name,
      variant_name: '',
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
      i.variant
        ? { variant: i.variant, quantity: i.quantity, unit_price: i.unit_price }
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
          onCreated={(p: ProductDetail) => { void addProductFromQuickAdd(p.id); }}
        />
        {itemsError && (
          <p className="text-[11px] text-destructive px-1">Ajoutez au moins un article ou service.</p>
        )}
      </div>

      <OrderItemsList items={items} onUpdateQty={updateQty} onRemove={removeItem} />

      {items.length > 0 && (
        <OrderSummary
          subtotal={subtotal}
          total={total}
          discount={discount}
          shipping={shipping}
          showDiscount={showDiscount}
          showShipping={showShipping}
          onDiscountChange={setDiscount}
          onShippingChange={setShipping}
          onShowDiscount={() => setShowDiscount(true)}
          onShowShipping={() => setShowShipping(true)}
          onClearDiscount={() => { setDiscount(''); setShowDiscount(false); }}
          onClearShipping={() => { setShipping(''); setShowShipping(false); }}
        />
      )}

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
          <PaymentPartialInput
            amountPaid={amountPaid}
            paymentError={paymentError}
            onAmountPaidChange={(v) => { setAmountPaid(v); setPaymentError(''); }}
          />
        )}
      </SectionChips>

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

      <NotesSection
        notes={notes}
        showNotes={showNotes}
        onNotesChange={setNotes}
        onShow={() => setShowNotes(true)}
        onHide={() => setShowNotes(false)}
      />

      <SubmitCTA
        isPending={isPending}
        hasItems={items.length > 0}
        total={total}
        onClick={handleSubmit}
      />
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
