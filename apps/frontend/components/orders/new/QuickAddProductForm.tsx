'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useCreateProduct, type ProductDetail, type ProductType, type ProductVariant } from '@/lib/hooks/useProducts';
import { ApiError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useShop } from '@/lib/hooks/useShop';
import { DEFAULT_VARIANT_NAME } from '@/lib/products';

interface QuickAddProductFormProps {
  onCreated: (product: ProductDetail) => void;
  onClose: () => void;
}

function ProductFormFields({
  name, price, nameLabel, namePlaceholder, priceLabel, errors, setName, setPrice, setErrors,
}: {
  name: string;
  price: string;
  nameLabel: string;
  namePlaceholder: string;
  priceLabel: string;
  errors: { name?: string; price?: string };
  setName: (v: string) => void;
  setPrice: (v: string) => void;
  setErrors: React.Dispatch<React.SetStateAction<{ name?: string; price?: string }>>;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="qpf-name" className="text-[0.8125rem] font-medium text-foreground">{nameLabel}</label>
        <input
          id="qpf-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
          placeholder={namePlaceholder}
          autoFocus
          className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="qpf-price" className="text-[0.8125rem] font-medium text-foreground">{priceLabel}</label>
        <div className="relative">
          <input
            id="qpf-price"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => { setPrice(e.target.value); setErrors((p) => ({ ...p, price: undefined })); }}
            className="w-full h-11 rounded-xl border border-border bg-background px-3 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
        </div>
        {errors.price && <p className="text-[11px] text-destructive">{errors.price}</p>}
      </div>
    </>
  );
}

export function QuickAddProductForm({ onCreated, onClose }: QuickAddProductFormProps) {
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

  function handleClose() {
    setName('');
    setPrice('');
    setType('product');
    setErrors({});
    onClose();
  }

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
        body: JSON.stringify({
          packaging_name: DEFAULT_VARIANT_NAME,
          unit: 'piece',
          base_quantity: '1',
          selling_price: price,
        }),
      });
      qc.invalidateQueries({ queryKey: qk.products.all });
      const refreshed = await apiFetch<ProductDetail>(`/products/${product.id}/`);
      onCreated(refreshed);
      handleClose();
    } catch (err) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[]>;
        setErrors({ name: data.name?.[0], price: data.selling_price?.[0] });
      } else {
        setErrors({ name: t('error') });
      }
    }
  }

  const priceLabel = type === 'service' ? t('price_service') : t('price_label');
  const namePlaceholder = type === 'service' ? t('name_placeholder_service') : t('name_placeholder_product');

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {!forcedType && <TypeChipRow type={type} onSelect={setType} productLabel={t('type_product')} serviceLabel={t('type_service')} />}
      <ProductFormFields
        name={name}
        price={price}
        nameLabel={t('name_label', { type })}
        namePlaceholder={namePlaceholder}
        priceLabel={priceLabel}
        errors={errors}
        setName={setName}
        setPrice={setPrice}
        setErrors={setErrors}
      />
      <QuickAddActions
        isPending={isPending}
        submitLabel={t('submit')}
        submittingLabel={t('submitting')}
        helperText={t('save_helper')}
        skipLabel={t('skip_save')}
        onSkip={handleClose}
      />
    </form>
  );
}

function QuickAddActions({ isPending, submitLabel, submittingLabel, helperText, skipLabel, onSkip }: {
  isPending: boolean;
  submitLabel: string;
  submittingLabel: string;
  helperText: string;
  skipLabel: string;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button type="submit" disabled={isPending} variant="secondary" className="self-start rounded-full px-5">
        {isPending ? submittingLabel : submitLabel}
      </Button>
      <p className="text-[11px] text-muted-foreground">{helperText}</p>
      <button type="button" onClick={onSkip} className="self-start text-xs text-primary hover:underline">
        {skipLabel}
      </button>
    </div>
  );
}

function TypeChipRow({ type, onSelect, productLabel, serviceLabel }: {
  type: ProductType; onSelect: (t: ProductType) => void; productLabel: string; serviceLabel: string;
}) {
  return (
    <div className="flex gap-2">
      <TypeChip active={type === 'product'} onClick={() => onSelect('product')} label={productLabel} />
      <TypeChip active={type === 'service'} onClick={() => onSelect('service')} label={serviceLabel} />
    </div>
  );
}

function TypeChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground active:bg-muted/70'
      }`}
    >
      {label}
    </button>
  );
}
