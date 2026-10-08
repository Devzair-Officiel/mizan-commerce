'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { TicketCustomerBlock } from '@/components/orders/new/TicketCustomerBlock';
import { SectionChips } from '@/components/orders/new/SectionChips';
import { StatusSwitch } from '@/components/orders/new/StatusSwitch';
import { SummaryAmountInput } from '@/components/orders/new/OrderSummary';
import { PaymentPartialInput } from '@/components/orders/new/PaymentPartialInput';
import { FloatingTextarea } from '@/components/ui/floating-fields';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { isDefaultVariant } from '@/lib/products';
import type { NewSaleForm } from '@/lib/hooks/useNewSaleForm';
import type { LineItem } from '@/components/orders/new/types';

type T = ReturnType<typeof useTranslations<'orders.new'>>;

function DesktopTicketLine({ item, onUpdateQty, money, t }: {
  item: LineItem; onUpdateQty: (id: string, qty: number) => void;
  money: (v: number | string) => string; t: T;
}) {
  const unitPrice = parseFloat(item.unit_price);
  const showVariant = item.variant_name && !isDefaultVariant(item.variant_name);
  const perUnit = t('per_unit');
  const sub = showVariant ? `${item.variant_name}, ${money(unitPrice)} ${perUnit}` : `${money(unitPrice)} ${perUnit}`;
  const decAria = item.quantity === 1 ? t('remove_one_aria', { name: item.product_name }) : t('decrease_aria');
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground block truncate">{item.product_name}</span>
        <span className="text-[0.8125rem] text-muted-foreground">{sub}</span>
      </div>
      <div className="flex items-center h-9 border border-border rounded-full shrink-0">
        <button type="button" aria-label={decAria} onClick={() => onUpdateQty(item.lineId, item.quantity - 1)}
          className="w-9 h-full flex items-center justify-center text-foreground hover:bg-muted rounded-s-full transition-colors text-base">
          −
        </button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums select-none">{item.quantity}</span>
        <button type="button" aria-label={t('increase_aria')} onClick={() => onUpdateQty(item.lineId, item.quantity + 1)}
          className="w-9 h-full flex items-center justify-center text-foreground hover:bg-muted rounded-e-full transition-colors text-base">
          +
        </button>
      </div>
      <span className="w-18 text-end text-sm font-bold tabular-nums shrink-0">
        {money(unitPrice * item.quantity)}
      </span>
    </div>
  );
}

function DesktopSummaryBlock({ form, money, hasItems }: { form: NewSaleForm; money: (v: number | string) => string; hasItems: boolean }) {
  const t = useTranslations('orders.new');
  const { data: shop } = useShop();
  const fulfillmentMode = shop?.fulfillment_mode ?? null;
  const currency = shop?.currency ?? 'EUR';
  const currencySymbol = currency === 'EUR' ? '€' : currency;
  const discountN = parseFloat(form.discount) || 0;
  const shippingN = parseFloat(form.shipping) || 0;
  const showAddDiscount = !form.showDiscount && discountN === 0;
  const showAddShipping = !form.showShipping && shippingN === 0 && fulfillmentMode !== 'on_site';
  const linkClass = 'text-[0.8125rem] font-semibold text-primary hover:underline';

  return (
    <div className="px-5 pt-4 pb-3 border-t border-border flex flex-col gap-2.5">
      {hasItems && (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('subtotal')}</span>
            <span className="tabular-nums">{money(form.subtotal)}</span>
          </div>
          {(form.showDiscount || discountN > 0) && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('discount')}</span>
              <SummaryAmountInput value={form.discount} onChange={form.setDiscount}
                ariaLabel={t('discount_label')} clearAriaLabel={t('remove_aria', { label: t('discount_label').toLowerCase() })}
                currencySymbol={currencySymbol} onClear={() => { form.setDiscount(''); form.setShowDiscount(false); }} />
            </div>
          )}
          {(form.showShipping || shippingN > 0) && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('shipping')}</span>
              <SummaryAmountInput value={form.shipping} onChange={form.setShipping}
                ariaLabel={t('shipping_label')} clearAriaLabel={t('remove_aria', { label: t('shipping_label').toLowerCase() })}
                currencySymbol={currencySymbol} onClear={() => { form.setShipping(''); form.setShowShipping(false); }} />
            </div>
          )}
          {(showAddDiscount || showAddShipping) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {showAddDiscount && (
                <button type="button" onClick={() => form.setShowDiscount(true)} className={linkClass}>
                  {t('add_discount')}
                </button>
              )}
              {showAddShipping && (
                <button type="button" onClick={() => form.setShowShipping(true)} className={linkClass}>
                  {t('add_shipping')}
                </button>
              )}
            </div>
          )}
        </>
      )}
      <div className={`flex justify-between items-baseline ${hasItems ? 'pt-2.5 border-t border-border' : ''}`}>
        <span className="text-[0.9375rem] font-semibold">{t('total')}</span>
        <span className={`text-2xl font-bold tabular-nums ${!hasItems ? 'text-muted-foreground' : ''}`}>{money(form.total)}</span>
      </div>
    </div>
  );
}

function DesktopTicketControls({ form }: { form: NewSaleForm }) {
  const t = useTranslations('orders.new');
  const tPayment = useTranslations('orders.payment');
  const { data: shop } = useShop();
  const catalogKind = useCatalogKind();
  const linkClass = 'text-[0.8125rem] font-semibold text-primary hover:underline';

  return (
    <>
      <div className="px-5 py-4 border-t border-border">
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
            <PaymentPartialInput amountPaid={form.amountPaid} paymentError={form.paymentError}
              onAmountPaidChange={(v) => { form.setAmountPaid(v); form.setPaymentError(''); }} />
          )}
        </SectionChips>
      </div>
      <div className="px-5 pb-4">
        <StatusSwitch
          value={form.orderStatus}
          onChange={form.setOrderStatus}
          fm={shop?.fulfillment_mode ?? null}
          catalogKind={catalogKind}
        />
      </div>
      <div className="px-5 pb-4">
        {form.showNotes || form.notes ? (
          <div className="relative">
            <FloatingTextarea id="desktop-notes" label={t('notes_label')} value={form.notes}
              onChange={(e) => form.setNotes(e.target.value)} rows={3} autoFocus={form.showNotes && !form.notes} />
            {!form.notes && (
              <button type="button" onClick={() => form.setShowNotes(false)} aria-label={t('notes_hide_aria')}
                className="absolute top-2 inset-e-2 p-1 text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} />
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => form.setShowNotes(true)}
            className={linkClass}>
            + {t('notes_show')}
          </button>
        )}
      </div>
    </>
  );
}

export function DesktopSaleTicket({ form }: { form: NewSaleForm }) {
  const t = useTranslations('orders.new');
  const kind = useCatalogKind();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden lg:sticky top-8">
      <TicketCustomerBlock form={form} />
      {form.items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('items_empty', { kind })}</p>
      ) : (
        <div className="border-t border-border">
          {form.items.map((item) => (
            <DesktopTicketLine key={item.lineId} item={item} onUpdateQty={form.updateQty} money={money} t={t} />
          ))}
        </div>
      )}
      <DesktopSummaryBlock form={form} money={money} hasItems={form.items.length > 0} />
      <DesktopTicketControls form={form} />
      <div className="px-5 pb-5">
        <button type="button" onClick={() => void form.handleSubmit()} disabled={form.isPending}
          className="w-full h-13 rounded-full bg-primary text-primary-foreground flex items-center justify-between px-6 text-[0.9375rem] font-semibold disabled:opacity-60 transition-opacity">
          <span>{form.isPending ? t('submit_creating') : t('submit_label')}</span>
          <span className="tabular-nums font-bold">{money(form.total)}</span>
        </button>
      </div>
    </div>
  );
}
