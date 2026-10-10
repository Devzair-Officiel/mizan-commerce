'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { QuickAddCustomer } from '@/components/orders/QuickAddDialogs';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';
import type { Customer } from '@/lib/hooks/useCustomers';

export function MobileCustomerCard({ form }: { form: NewSaleForm }) {
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
      <QuickAddCustomer open={form.createCustomerOpen} onOpenChange={form.setCreateCustomerOpen}
        onCreated={(c: Customer) => { form.setCustomerId(c.id); }} />
    </div>
  );
}
