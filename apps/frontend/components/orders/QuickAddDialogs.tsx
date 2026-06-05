'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { useCreateCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { useCreateProduct, type ProductDetail, type ProductType, type ProductVariant } from '@/lib/hooks/useProducts';
import { ApiError, apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

function AddButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center w-11 h-11 rounded-2xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary transition-colors shrink-0 self-stretch"
      aria-label={ariaLabel}
    >
      <Plus size={18} />
    </button>
  );
}

export function QuickAddCustomer({
  onCreated,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger,
}: {
  onCreated: (customer: Customer) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const t = useTranslations('orders.quickAdd');
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const { mutateAsync, isPending } = useCreateCustomer();
  const qc = useQueryClient();

  function handleClose() {
    setOpen(false);
    setName('');
    setError('');
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t('customer_required')); return; }
    try {
      const customer = await mutateAsync({ name: name.trim() });
      qc.setQueriesData({ queryKey: qk.customers.all }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const paged = old as { results?: Customer[] };
        if (!Array.isArray(paged.results)) return old;
        if (paged.results.some((c) => c.id === customer.id)) return paged;
        return { ...paged, results: [customer, ...paged.results] };
      });
      onCreated(customer);
      handleClose();
    } catch (err) {
      if (err instanceof ApiError && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, string[]>;
        setError(data.name?.[0] ?? t('customer_error'));
      } else {
        setError(t('customer_error'));
      }
    }
  }

  return (
    <>
      {!hideTrigger && <AddButton onClick={() => setOpen(true)} ariaLabel={t('trigger_aria')} />}
      <BottomSheet open={open} onClose={handleClose} title={t('customer_title')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="qc-name"
              label={t('customer_label')}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              autoFocus
            />
            {error && <p className="text-[11px] text-destructive px-1">{error}</p>}
          </div>
          <Button type="submit" disabled={isPending} className="w-full rounded-full">
            {isPending ? t('customer_creating') : t('customer_submit')}
          </Button>
        </form>
      </BottomSheet>
    </>
  );
}

export function QuickAddProduct({
  onCreated,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger,
}: {
  onCreated: (product: ProductDetail) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const t = useTranslations('orders.quickAdd');
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<ProductType>('product');
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const { mutateAsync, isPending } = useCreateProduct();
  const qc = useQueryClient();

  function handleClose() {
    setOpen(false);
    setName('');
    setPrice('');
    setType('product');
    setErrors({});
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    const errs: { name?: string; price?: string } = {};
    if (!name.trim()) errs.name = t('name_required');
    if (!price || isNaN(parseFloat(price))) errs.price = t('price_required');
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      const product = await mutateAsync({
        name: name.trim(),
        type,
      });
      await apiFetch<ProductVariant>(`/products/${product.id}/variants/`, {
        method: 'POST',
        body: JSON.stringify({
          packaging_name: 'Par défaut',
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
        setErrors({
          name: data.name?.[0],
          price: data.selling_price?.[0],
        });
      } else {
        setErrors({ name: t('error') });
      }
    }
  }

  const priceLabel = type === 'service' ? t('price_service') : t('price_label');

  return (
    <>
      {!hideTrigger && <AddButton onClick={() => setOpen(true)} ariaLabel={t('trigger_aria')} />}
      <BottomSheet open={open} onClose={handleClose} title={t('product_title')}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground px-1">{t('type_label')}</span>
            <div className="flex gap-2">
              <TypeChip active={type === 'product'} onClick={() => setType('product')} label={t('type_product')} />
              <TypeChip active={type === 'service'} onClick={() => setType('service')} label={t('type_service')} />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="qp-name"
              label={t('name_label')}
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
              autoFocus
            />
            {errors.name && <p className="text-[11px] text-destructive px-1">{errors.name}</p>}
          </div>
          <div className="flex flex-col gap-0.5">
            <FloatingInput
              id="qp-price"
              label={priceLabel}
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => { setPrice(e.target.value); setErrors((p) => ({ ...p, price: undefined })); }}
            />
            {errors.price && <p className="text-[11px] text-destructive px-1">{errors.price}</p>}
          </div>
          <Button type="submit" disabled={isPending} className="w-full rounded-full">
            {isPending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </BottomSheet>
    </>
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
