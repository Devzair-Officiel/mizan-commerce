'use client';

import { MobileCustomerCard } from '@/components/orders/new/MobileCustomerCard';
import { MobileItemsCard } from '@/components/orders/new/MobileItemsCard';
import { MobilePaymentCard } from '@/components/orders/new/MobilePaymentCard';
import { OrderSummary } from '@/components/orders/new/OrderSummary';
import { MobileSubmitBar } from '@/components/orders/new/MobileSubmitBar';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';

export function NewSaleFormMobile({ form }: { form: NewSaleForm }) {
  return (
    <div className="flex flex-col gap-4 p-4 pb-44">
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
      {form.mode === 'create' && <MobilePaymentCard form={form} />}
      <MobileSubmitBar mode={form.mode} total={form.total} isPending={form.isPending} onClick={form.handleSubmit} />
    </div>
  );
}
