'use client';

import { Suspense } from 'react';
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
import { SubmitCTA } from '@/components/orders/new/SubmitCTA';
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

function MobileCustomerSection({ form }: { form: ReturnType<typeof useNewSaleForm> }) {
  const t = useTranslations('orders.new');
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        {t('section_customer')}
      </span>
      <CustomerPicker
        value={form.customerId}
        selectedCustomer={form.selectedCustomer}
        onChange={(id) => form.setCustomerId(id)}
        onRequestCreate={() => form.setCreateCustomerOpen(true)}
      />
      <QuickAddCustomer
        hideTrigger
        open={form.createCustomerOpen}
        onOpenChange={form.setCreateCustomerOpen}
        onCreated={(c: Customer) => { form.setCustomerId(c.id); }}
      />
      {!form.customerId && form.paymentStatus !== 'paid' && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 px-1">
          {t('no_customer_payment_warning')}
        </p>
      )}
    </div>
  );
}

function MobileItemsSection({ form }: { form: ReturnType<typeof useNewSaleForm> }) {
  const t = useTranslations('orders.new');
  const kind = useCatalogKind();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
        {t('section_items', { kind })}
      </span>
      <ProductPicker
        onPick={form.addItem}
        onFreeLine={form.addFreeLine}
        onRequestCreate={() => form.setCreateProductOpen(true)}
      />
      <QuickAddProduct
        hideTrigger
        open={form.createProductOpen}
        onOpenChange={form.setCreateProductOpen}
        onCreated={(p: ProductDetail) => { void form.addProductFromQuickAdd(p.id); }}
      />
      {form.itemsError && (
        <p className="text-[11px] text-destructive px-1">{t('items_required', { kind })}</p>
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
    <div className="flex flex-col gap-5 p-4 pb-32">
      <MobileCustomerSection form={form} />
      <MobileItemsSection form={form} />

      <OrderItemsList items={form.items} onUpdateQty={form.updateQty} onRemove={form.removeItem} />

      {form.items.length > 0 && (
        <OrderSummary
          subtotal={form.subtotal}
          total={form.total}
          discount={form.discount}
          shipping={form.shipping}
          showDiscount={form.showDiscount}
          showShipping={form.showShipping}
          onDiscountChange={form.setDiscount}
          onShippingChange={form.setShipping}
          onShowDiscount={() => form.setShowDiscount(true)}
          onShowShipping={() => form.setShowShipping(true)}
          onClearDiscount={() => { form.setDiscount(''); form.setShowDiscount(false); }}
          onClearShipping={() => { form.setShipping(''); form.setShowShipping(false); }}
        />
      )}

      <SectionChips
        title={t('payment_title')}
        options={[
          { value: 'unpaid', label: tPayment('unpaid') },
          { value: 'partial', label: tPayment('partial') },
          { value: 'paid', label: tPayment('paid') },
        ]}
        value={form.paymentStatus}
        onChange={(v) => { form.setPaymentStatus(v as 'unpaid' | 'partial' | 'paid'); form.setPaymentError(''); }}
      >
        {form.paymentStatus === 'partial' && (
          <PaymentPartialInput
            amountPaid={form.amountPaid}
            paymentError={form.paymentError}
            onAmountPaidChange={(v) => { form.setAmountPaid(v); form.setPaymentError(''); }}
          />
        )}
      </SectionChips>

      <StatusSwitch
        value={form.orderStatus}
        onChange={form.setOrderStatus}
        fm={shop?.fulfillment_mode ?? null}
        catalogKind={catalogKind}
      />

      <NotesSection
        notes={form.notes}
        showNotes={form.showNotes}
        onNotesChange={form.setNotes}
        onShow={() => form.setShowNotes(true)}
        onHide={() => form.setShowNotes(false)}
      />

      <SubmitCTA
        isPending={form.isPending}
        hasItems={form.items.length > 0}
        total={form.total}
        onClick={form.handleSubmit}
      />
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
