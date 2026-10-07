'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
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
  name, price, nameLabel, priceLabel, errors, setName, setPrice, setErrors,
}: {
  name: string;
  price: string;
  nameLabel: string;
  priceLabel: string;
  errors: { name?: string; price?: string };
  setName: (v: string) => void;
  setPrice: (v: string) => void;
  setErrors: React.Dispatch<React.SetStateAction<{ name?: string; price?: string }>>;
}) {
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <FloatingInput
          id="qpf-name"
          label={nameLabel}
          value={name}
          onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
          autoFocus
        />
        {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name}</p>}
      </div>
      <div className="flex flex-col gap-0.5">
        <FloatingInput
          id="qpf-price"
          label={priceLabel}
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => { setPrice(e.target.value); setErrors((p) => ({ ...p, price: undefined })); }}
        />
        {errors.price && <p className="text-[11px] text-destructive px-1">{errors.price}</p>}
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {!forcedType && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground px-1">{t('type_label')}</span>
          <div className="flex gap-2">
            <TypeChip active={type === 'product'} onClick={() => setType('product')} label={t('type_product')} />
            <TypeChip active={type === 'service'} onClick={() => setType('service')} label={t('type_service')} />
          </div>
        </div>
      )}
      <ProductFormFields
        name={name}
        price={price}
        nameLabel={t('name_label')}
        priceLabel={priceLabel}
        errors={errors}
        setName={setName}
        setPrice={setPrice}
        setErrors={setErrors}
      />
      <Button type="submit" disabled={isPending} className="w-full rounded-full">
        {isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
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
