'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { User, X, Phone, MapPin } from 'lucide-react';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';

function NoCustomerRow({ onAssociate, label }: { onAssociate: () => void; label: string }) {
  const t = useTranslations('orders.new');
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
        <User size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground block">{t('no_customer_name')}</span>
        <span className="text-xs text-muted-foreground">{t('no_customer_sub')}</span>
      </div>
      <button
        type="button"
        onClick={onAssociate}
        className="shrink-0 text-xs font-medium text-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors"
      >
        {label}
      </button>
    </div>
  );
}

export function TicketCustomerBlock({ form }: { form: NewSaleForm }) {
  const t = useTranslations('orders.new');
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const { customerId, selectedCustomer } = form;

  const initial = selectedCustomer ? (selectedCustomer.first_name?.[0] ?? selectedCustomer.name?.[0] ?? '?').toUpperCase() : '';
  const fullName = selectedCustomer
    ? (selectedCustomer.first_name ? `${selectedCustomer.first_name} ${selectedCustomer.name}` : selectedCustomer.name)
    : '';

  return (
    <>
      <div className="px-4 pt-3 pb-3 border-b border-border flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">{t('customer_label')}</span>
        {customerId && selectedCustomer ? (
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-foreground truncate block">{fullName}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
                {selectedCustomer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={11} className="shrink-0" />
                    <span className="tabular-nums">{selectedCustomer.phone}</span>
                  </span>
                )}
                {selectedCustomer.city && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} className="shrink-0" />
                    <span>{selectedCustomer.city}</span>
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label={t('remove_customer_aria')}
              onClick={() => form.setCustomerId('')}
              className="shrink-0 w-8 h-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors flex items-center justify-center"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <NoCustomerRow onAssociate={() => setCustomerPickerOpen(true)} label={t('associate_customer')} />
        )}
      </div>
      <CustomerPicker
        hideTrigger
        open={customerPickerOpen}
        onOpenChange={setCustomerPickerOpen}
        value={customerId}
        selectedCustomer={selectedCustomer}
        onChange={(id) => { form.setCustomerId(id); setCustomerPickerOpen(false); }}
        onRequestCreate={() => { setCustomerPickerOpen(false); form.setCreateCustomerOpen(true); }}
      />
      {!customerId && form.paymentStatus !== 'paid' && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200/50 dark:border-amber-800/30">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('no_customer_payment_warning')}
          </p>
        </div>
      )}
    </>
  );
}
