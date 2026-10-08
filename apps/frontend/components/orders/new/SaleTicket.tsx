'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { User, X } from 'lucide-react';
import { Phone, MapPin } from 'lucide-react';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { OrderItemsList } from '@/components/orders/new/OrderItemsList';
import { OrderSummary } from '@/components/orders/new/OrderSummary';
import { SectionChips } from '@/components/orders/new/SectionChips';
import { NotesSection } from '@/components/orders/new/NotesSection';
import { PaymentPartialInput } from '@/components/orders/new/PaymentPartialInput';
import { CustomerPicker } from '@/components/orders/CustomerPicker';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useOrderStatusLabel } from '@/lib/orderStatusLabels';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';

interface SaleTicketProps {
  form: NewSaleForm;
}

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

const CHIPS_TITLE_CLASS = 'text-[0.8125rem] font-medium text-muted-foreground px-1';

function TicketPaymentControls({ form }: { form: NewSaleForm }) {
  const t = useTranslations('orders.new');
  const tPayment = useTranslations('orders.payment');
  const label = useOrderStatusLabel();
  return (
    <>
      <div className="px-4 py-4 border-t border-border">
        <SectionChips
          title={t('payment_title')}
          titleClassName={CHIPS_TITLE_CLASS}
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
      <div className="px-4 pb-4">
        <SectionChips
          title={t('status_title')}
          titleClassName={CHIPS_TITLE_CLASS}
          options={[
            { value: 'draft', label: t('status_draft') },
            { value: 'to_prepare', label: label('to_prepare') },
            { value: 'shipped', label: label('shipped') },
          ]}
          value={form.orderStatus}
          onChange={(v) => form.setOrderStatus(v as 'draft' | 'to_prepare' | 'shipped')}
        />
      </div>
      <div className="px-4 pb-4">
        <NotesSection
          notes={form.notes}
          showNotes={form.showNotes}
          onNotesChange={form.setNotes}
          onShow={() => form.setShowNotes(true)}
          onHide={() => form.setShowNotes(false)}
        />
      </div>
    </>
  );
}

export function SaleTicket({ form }: SaleTicketProps) {
  const t = useTranslations('orders.new');
  const { data: shop } = useShop();
  const kind = useCatalogKind();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      <TicketCustomerBlock form={form} />

      {form.items.length === 0 ? (
        <>
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t('items_empty', { kind })}
          </p>
          <div className="px-4 py-3 flex items-center justify-between border-t border-border">
            <span className="text-sm text-muted-foreground">{t('total')}</span>
            <span className="text-sm font-semibold text-muted-foreground tabular-nums">{money('0')}</span>
          </div>
        </>
      ) : (
        <>
          <OrderItemsList items={form.items} onUpdateQty={form.updateQty} onRemove={form.removeItem} />
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
        </>
      )}

      <TicketPaymentControls form={form} />

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
