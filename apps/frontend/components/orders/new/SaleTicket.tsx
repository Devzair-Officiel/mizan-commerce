'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { User, X } from 'lucide-react';
import { Phone, MapPin } from 'lucide-react';
import { OrderItemsList } from '@/components/orders/new/OrderItemsList';
import { OrderSummary } from '@/components/orders/new/OrderSummary';
import { SectionChips } from '@/components/orders/new/SectionChips';
import { NotesSection } from '@/components/orders/new/NotesSection';
import { PaymentPartialInput } from '@/components/orders/new/PaymentPartialInput';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';

interface SaleTicketProps {
  form: NewSaleForm;
}

export function SaleTicket({ form }: SaleTicketProps) {
  const t = useTranslations('orders.new');
  const tPayment = useTranslations('orders.payment');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const { selectedCustomer, customerId } = form;

  const initial = selectedCustomer
    ? (selectedCustomer.first_name?.[0] ?? selectedCustomer.name?.[0] ?? '?').toUpperCase()
    : '';
  const fullName = selectedCustomer
    ? (selectedCustomer.first_name
        ? `${selectedCustomer.first_name} ${selectedCustomer.name}`
        : selectedCustomer.name)
    : '';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Customer block */}
      <div className="px-4 py-3 border-b border-border">
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
              aria-label={t('remove_customer_aria') ?? 'Retirer le client'}
              onClick={() => form.setCustomerId('')}
              className="shrink-0 w-8 h-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors flex items-center justify-center"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
              <User size={16} />
            </div>
            <span className="flex-1 text-sm text-muted-foreground">Sans client · Vente au comptoir</span>
            <button
              type="button"
              onClick={() => setCustomerPickerOpen(true)}
              className="shrink-0 text-xs font-medium text-primary border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/5 transition-colors"
            >
              Associer un client
            </button>
          </div>
        )}
      </div>

      {/* CustomerPicker controlled */}
      <CustomerPicker
        hideTrigger
        open={customerPickerOpen}
        onOpenChange={setCustomerPickerOpen}
        value={customerId}
        selectedCustomer={selectedCustomer}
        onChange={(id) => { form.setCustomerId(id); setCustomerPickerOpen(false); }}
        onRequestCreate={() => { setCustomerPickerOpen(false); form.setCreateCustomerOpen(true); }}
      />

      {/* Warning */}
      {!customerId && form.paymentStatus !== 'paid' && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200/50 dark:border-amber-800/30">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('no_customer_payment_warning')}
          </p>
        </div>
      )}

      {/* Items */}
      {form.items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t('items_empty')}
        </p>
      ) : (
        <OrderItemsList items={form.items} onUpdateQty={form.updateQty} onRemove={form.removeItem} />
      )}

      {/* Summary */}
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

      {/* Payment */}
      <div className="px-4 py-4 border-t border-border">
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
      </div>

      {/* Order status */}
      <div className="px-4 pb-4">
        <SectionChips
          title={t('status_title')}
          options={[
            { value: 'draft', label: t('status_draft') },
            { value: 'to_prepare', label: form.toPrepareLabel },
            { value: 'shipped', label: t('status_shipped') },
          ]}
          value={form.orderStatus}
          onChange={(v) => form.setOrderStatus(v as 'draft' | 'to_prepare' | 'shipped')}
        />
      </div>

      {/* Notes */}
      <div className="px-4 pb-4">
        <NotesSection
          notes={form.notes}
          showNotes={form.showNotes}
          onNotesChange={form.setNotes}
          onShow={() => form.setShowNotes(true)}
          onHide={() => form.setShowNotes(false)}
        />
      </div>

      {/* CTA */}
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => void form.handleSubmit()}
          disabled={form.isPending}
          className="w-full h-13 rounded-full bg-primary text-primary-foreground flex items-center justify-between px-6 text-sm font-semibold disabled:opacity-60 transition-opacity"
        >
          <span>{form.isPending ? t('submit_creating') : t('submit_label')}</span>
          <span className="tabular-nums font-bold">{money(form.total)}</span>
        </button>
      </div>
    </div>
  );
}
