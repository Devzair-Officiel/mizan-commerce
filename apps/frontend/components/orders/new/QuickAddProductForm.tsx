'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateProduct, type ProductDetail, type ProductType, type ProductVariant } from '@/lib/hooks/useProducts';
import { ApiError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useShop } from '@/lib/hooks/useShop';
import { DEFAULT_VARIANT_NAME } from '@/lib/products';

interface QuickAddProductFormProps {
  onCreated: (product: ProductDetail) => void;
  onClose: () => void;
  onBack?: () => void;
}

export function QuickAddProductForm({ onCreated, onClose, onBack }: QuickAddProductFormProps) {
  const t = useTranslations('orders.quickAdd');
  const { data: shop } = useShop();
  const ck = shop?.catalog_kind ?? 'both';
  const forcedType: 'product' | 'service' | null =
    ck === 'products' ? 'product' : ck === 'services' ? 'service' : null;
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<ProductType>(forcedType ?? 'product');
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const { mutateAsync, isPending } = useCreateProduct();
  const qc = useQueryClient();
  const currency = shop?.currency ?? 'EUR';

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const errs: { name?: string; price?: string } = {};
    if (!name.trim()) errs.name = t('name_required');
    if (!price || isNaN(parseFloat(price))) errs.price = t('price_required');
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      const product = await mutateAsync({ name: name.trim(), type });
      await apiFetch<ProductVariant>(`/products/${product.id}/variants/`, {
        method: 'POST',
        body: JSON.stringify({ packaging_name: DEFAULT_VARIANT_NAME, unit: 'piece', base_quantity: '1', selling_price: price }),
      });
      qc.invalidateQueries({ queryKey: qk.products.all });
      const refreshed = await apiFetch<ProductDetail>(`/products/${product.id}/`);
      onCreated(refreshed);
      setName(''); setPrice(''); setType(forcedType ?? 'product'); setErrors({});
    } catch (err) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[]>;
        setErrors({ name: data.name?.[0], price: data.selling_price?.[0] });
      } else {
        setErrors({ name: t('error') });
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {onBack && (
        <button type="button" onClick={onBack}
          className="self-start text-[0.8125rem] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          ← {t('back_to_catalog')}
        </button>
      )}
      <QuickAddFormCard
        type={type} forcedType={forcedType} name={name} price={price}
        errors={errors} currency={currency} isPending={isPending}
        onTypeChange={setType} onNameChange={(v) => { setName(v); setErrors((p) => ({ ...p, name: undefined })); }}
        onPriceChange={(v) => { setPrice(v); setErrors((p) => ({ ...p, price: undefined })); }}
        submitLabel={t('submit')} submittingLabel={t('submitting')} helperText={t('save_helper')}
        nameLabel={t('name_label', { type })} priceLabel={type === 'service' ? t('price_service') : t('price_label')}
        namePlaceholder={type === 'service' ? t('name_placeholder_service') : t('name_placeholder_product')}
        typeProductLabel={t('type_product')} typeServiceLabel={t('type_service')}
      />
    </form>
  );
}

function QuickAddFormCard({ type, forcedType, name, price, errors, currency, isPending,
  onTypeChange, onNameChange, onPriceChange, submitLabel, submittingLabel, helperText,
  nameLabel, priceLabel, namePlaceholder, typeProductLabel, typeServiceLabel }: {
  type: ProductType; forcedType: 'product' | 'service' | null;
  name: string; price: string; errors: { name?: string; price?: string };
  currency: string; isPending: boolean;
  onTypeChange: (t: ProductType) => void; onNameChange: (v: string) => void; onPriceChange: (v: string) => void;
  submitLabel: string; submittingLabel: string; helperText: string;
  nameLabel: string; priceLabel: string; namePlaceholder: string;
  typeProductLabel: string; typeServiceLabel: string;
}) {
  const currencySymbol = currency === 'EUR' ? '€' : currency;
  return (
    <div className="rounded-2xl border border-border bg-background p-5 flex flex-col gap-4">
      {!forcedType && (
        <div className="inline-grid grid-cols-2 min-w-65 bg-muted p-1 rounded-[0.875rem]">
          <TypeButton active={type === 'product'} onClick={() => onTypeChange('product')} label={typeProductLabel} />
          <TypeButton active={type === 'service'} onClick={() => onTypeChange('service')} label={typeServiceLabel} />
        </div>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(12.5rem, 1fr))' }}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="qpf-name" className="text-[0.8125rem] font-medium text-foreground">{nameLabel}</label>
          <input id="qpf-name" type="text" value={name} onChange={(e) => onNameChange(e.target.value)}
            placeholder={namePlaceholder} autoFocus
            className="h-11 rounded-xl border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="qpf-price" className="text-[0.8125rem] font-medium text-foreground">{priceLabel}</label>
          <div className="relative">
            <input id="qpf-price" type="number" step="0.01" min="0" value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-card px-3.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">{currencySymbol}</span>
          </div>
          {errors.price && <p className="text-[11px] text-destructive">{errors.price}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={isPending}
          className="h-10 rounded-full px-4.5 bg-secondary text-secondary-foreground text-[0.8125rem] font-semibold disabled:opacity-60 transition-opacity shrink-0">
          {isPending ? submittingLabel : `+ ${submitLabel}`}
        </button>
        <span className="text-[0.8125rem] text-muted-foreground">{helperText}</span>
      </div>
    </div>
  );
}

function TypeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[0.625rem] px-3 py-1.5 text-[0.8125rem] transition-all duration-150 ${
        active
          ? 'bg-card text-foreground font-semibold shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
