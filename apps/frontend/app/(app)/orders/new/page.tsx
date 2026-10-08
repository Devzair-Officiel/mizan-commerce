'use client';

import { useState, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { QuickAddCustomer, QuickAddProduct } from '@/components/orders/QuickAddDialogs';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import { ProductPicker } from '@/components/orders/ProductPicker';
import { OrderItemsList } from '@/components/orders/new/OrderItemsList';
import { OrderSummary } from '@/components/orders/new/OrderSummary';
import { SectionChips } from '@/components/orders/new/SectionChips';
import { NotesSection } from '@/components/orders/new/NotesSection';
import { PaymentPartialInput } from '@/components/orders/new/PaymentPartialInput';
import { MobileSubmitBar } from '@/components/orders/new/MobileSubmitBar';
import { DesktopCatalogPanel } from '@/components/orders/new/DesktopCatalogPanel';
import { DesktopSaleTicket } from '@/components/orders/new/DesktopSaleTicket';
import { StatusSwitch } from '@/components/orders/new/StatusSwitch';
import { useNewSaleForm } from '@/lib/hooks/useNewSaleForm';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useShop } from '@/lib/hooks/useShop';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import type { Customer } from '@/lib/hooks/useCustomers';
import type { ProductDetail } from '@/lib/hooks/useProducts';

function NewSaleFormDesktop() {
  const form = useNewSaleForm();

  return (
    <div className="flex gap-6 p-6 pb-10 items-start">
      <div className="flex-1 min-w-0">
        <DesktopCatalogPanel form={form} />
      </div>
      <div className="w-105 shrink-0">
        <DesktopSaleTicket form={form} />
      </div>
      <QuickAddCustomer
        hideTrigger
        open={form.createCustomerOpen}
        onOpenChange={form.setCreateCustomerOpen}
        onCreated={(c: Customer) => { form.setCustomerId(c.id); }}
      />
    </div>
  );
}

function MobileCustomerCard({ form }: { form: ReturnType<typeof useNewSaleForm> }) {
  const t = useTranslations('orders.new');
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasCustomer = !!form.customerId;
  const label = hasCustomer ? (form.selectedCustomer?.name ?? '') : t('no_customer_name');
  const sub = hasCustomer ? (form.selectedCustomer?.phone ?? '') : t('no_customer_sub');

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-base font-semibold text-foreground truncate">{label}</span>
        {sub ? <span className="text-xs text-muted-foreground truncate">{sub}</span> : null}
      </div>
      <button type="button" onClick={() => setPickerOpen(true)}
        className="shrink-0 h-9 px-4 rounded-full border border-border text-sm font-medium text-foreground active:bg-muted transition-colors">
        {t('associate_customer')}
      </button>
      <CustomerPicker hideTrigger open={pickerOpen} onOpenChange={setPickerOpen}
        value={form.customerId} selectedCustomer={form.selectedCustomer}
        onChange={(id) => { form.setCustomerId(id); setPickerOpen(false); }}
        onRequestCreate={() => { setPickerOpen(false); form.setCreateCustomerOpen(true); }} />
      <QuickAddCustomer hideTrigger open={form.createCustomerOpen} onOpenChange={form.setCreateCustomerOpen}
        onCreated={(c: Customer) => { form.setCustomerId(c.id); }} />
    </div>
  );
}

function MobileItemsCard({ form }: { form: ReturnType<typeof useNewSaleForm> }) {
  const t = useTranslations('orders.new');
  const kind = useCatalogKind();
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {form.items.length > 0 && (
        <OrderItemsList noCard items={form.items} onUpdateQty={form.updateQty} onRemove={form.removeItem} />
      )}
      <div className={`p-3 ${form.items.length > 0 ? 'border-t border-border' : ''}`}>
        <ProductPicker variant="dashed" onPick={form.addItem} onFreeLine={form.addFreeLine}
          onRequestCreate={() => form.setCreateProductOpen(true)} itemCount={form.items.length} />
        <QuickAddProduct hideTrigger open={form.createProductOpen} onOpenChange={form.setCreateProductOpen}
          onCreated={(p: ProductDetail) => { void form.addProductFromQuickAdd(p.id); }} />
      </div>
      {form.itemsError && (
        <p className="text-xs text-destructive px-4 pb-2">{t('items_required', { kind })}</p>
      )}
    </div>
  );
}

function NewSaleFormMobile() {
  const t = useTranslations('orders.new');
  const tPayment = useTranslations('orders.payment');
  const form = useNewSaleForm();
  const { data: shop } = useShop();
  const catalogKind = useCatalogKind();

  return (
    <div className="flex flex-col gap-4 p-4 pb-36">
      <MobileCustomerCard form={form} />
      <MobileItemsCard form={form} />

      <OrderSummary
        subtotal={form.subtotal} total={form.total}
        discount={form.discount} shipping={form.shipping}
        showDiscount={form.showDiscount} showShipping={form.showShipping}
        onDiscountChange={form.setDiscount} onShippingChange={form.setShipping}
        onShowDiscount={() => form.setShowDiscount(true)} onShowShipping={() => form.setShowShipping(true)}
        onClearDiscount={() => { form.setDiscount(''); form.setShowDiscount(false); }}
        onClearShipping={() => { form.setShipping(''); form.setShowShipping(false); }}
      />

      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-4">
        <SectionChips title={t('payment_title')}
          titleClassName="text-[0.8125rem] font-medium text-muted-foreground"
          options={[
            { value: 'unpaid', label: tPayment('unpaid') },
            { value: 'partial', label: tPayment('partial') },
            { value: 'paid', label: tPayment('paid') },
          ]}
          value={form.paymentStatus}
          onChange={(v) => { form.setPaymentStatus(v as 'unpaid' | 'partial' | 'paid'); form.setPaymentError(''); }}
        >
          {form.paymentStatus === 'partial' && (
            <PaymentPartialInput amountPaid={form.amountPaid} paymentError={form.paymentError}
              onAmountPaidChange={(v) => { form.setAmountPaid(v); form.setPaymentError(''); }} />
          )}
        </SectionChips>
        <StatusSwitch value={form.orderStatus} onChange={form.setOrderStatus}
          fm={shop?.fulfillment_mode ?? null} catalogKind={catalogKind} />
        <NotesSection notes={form.notes} showNotes={form.showNotes} onNotesChange={form.setNotes}
          onShow={() => form.setShowNotes(true)} onHide={() => form.setShowNotes(false)} />
      </div>

      <MobileSubmitBar total={form.total} isPending={form.isPending} onClick={form.handleSubmit} />
    </div>
  );
}

function NewSaleFormRouter() {
  const isDesktop = useIsDesktop();

  if (isDesktop === true) {
    return <NewSaleFormDesktop />;
  }
  return <NewSaleFormMobile />;
}

export default function NewOrderPage() {
  const t = useTranslations('orders.new');
  const tList = useTranslations('orders.list');
  return (
    <>
      <TopBar title={t('topbar')} back backLabel={tList('topbar')} hideSearch />
      <Suspense>
        <NewSaleFormRouter />
      </Suspense>
    </>
  );
}
