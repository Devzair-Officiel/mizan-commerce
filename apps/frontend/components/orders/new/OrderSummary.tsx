'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { AddLink } from '@/components/orders/new/AddLink';
import { useShop } from '@/lib/hooks/useShop';
import { useFormatMoney } from '@/lib/hooks/useFormat';

interface OrderSummaryProps {
  subtotal: number;
  total: number;
  discount: string;
  shipping: string;
  showDiscount: boolean;
  showShipping: boolean;
  onDiscountChange: (v: string) => void;
  onShippingChange: (v: string) => void;
  onShowDiscount: () => void;
  onShowShipping: () => void;
  onClearDiscount: () => void;
  onClearShipping: () => void;
}

export function OrderSummary({
  subtotal, total, discount, shipping,
  showDiscount, showShipping,
  onDiscountChange, onShippingChange,
  onShowDiscount, onShowShipping,
  onClearDiscount, onClearShipping,
}: OrderSummaryProps) {
  const t = useTranslations('orders.new');
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const money = (v: number | string) => formatMoney(v, currency, { maximumFractionDigits: 2 });

  const fulfillmentMode = shop?.fulfillment_mode ?? null;
  const discountN = parseFloat(discount) || 0;
  const shippingN = parseFloat(shipping) || 0;
  const showAddLine =
    (!showDiscount && discountN === 0) || (!showShipping && shippingN === 0 && fulfillmentMode !== 'on_site');

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex flex-col">
        <SummaryRow label={t('subtotal')}>
          <span className="text-sm font-medium text-foreground tabular-nums">{money(subtotal)}</span>
        </SummaryRow>
        {(showDiscount || discountN > 0) && (
          <SummaryRow label={t('discount')}>
            <SummaryAmountInput
              value={discount}
              onChange={onDiscountChange}
              ariaLabel={t('discount_label')}
              clearAriaLabel={t('remove_aria', { label: t('discount_label').toLowerCase() })}
              currencySymbol={currency === 'EUR' ? '€' : currency}
              onClear={onClearDiscount}
            />
          </SummaryRow>
        )}
        {(showShipping || shippingN > 0) && (
          <SummaryRow label={t('shipping')}>
            <SummaryAmountInput
              value={shipping}
              onChange={onShippingChange}
              ariaLabel={t('shipping_label')}
              clearAriaLabel={t('remove_aria', { label: t('shipping_label').toLowerCase() })}
              currencySymbol={currency === 'EUR' ? '€' : currency}
              onClear={onClearShipping}
            />
          </SummaryRow>
        )}
        {showAddLine && (
          <div className="flex flex-wrap items-center gap-x-4 px-4 border-b border-border">
            {!showDiscount && discountN === 0 && (
              <AddLink onClick={onShowDiscount}>{t('add_discount')}</AddLink>
            )}
            {!showShipping && shippingN === 0 && fulfillmentMode !== 'on_site' && (
              <AddLink onClick={onShowShipping}>{t('add_shipping')}</AddLink>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
          <span className="text-sm font-semibold text-foreground">{t('total')}</span>
          <span className="text-base font-bold text-foreground tabular-nums">{money(total)}</span>
        </div>
      </div>
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

export function SummaryAmountInput({
  value, onChange, ariaLabel, clearAriaLabel, currencySymbol, onClear,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  clearAriaLabel: string;
  currencySymbol: string;
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
        <span className="text-sm text-muted-foreground pr-2">{currencySymbol}</span>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearAriaLabel}
          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
