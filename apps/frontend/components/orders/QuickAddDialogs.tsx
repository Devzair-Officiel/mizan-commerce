'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FloatingInput } from '@/components/ui/floating-fields';
import { useCreateCustomer, type Customer } from '@/lib/hooks/useCustomers';
import { type ProductDetail } from '@/lib/hooks/useProducts';
import { ApiError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { QuickAddProductForm } from '@/components/orders/new/QuickAddProductForm';

interface QuickAddProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: T) => void;
}

export function QuickAddCustomer({ open, onOpenChange: setOpen, onCreated }: QuickAddProps<Customer>) {
  const t = useTranslations('orders.quickAdd');
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

export function QuickAddProduct({ open, onOpenChange: setOpen, onCreated }: QuickAddProps<ProductDetail>) {
  const t = useTranslations('orders.quickAdd');
  const kind = useCatalogKind();

  function handleClose() {
    setOpen(false);
  }

  return (
    <>
      <BottomSheet open={open} onClose={handleClose} title={t('product_title', { kind })}>
        <QuickAddProductForm
          onCreated={(product) => { onCreated(product); handleClose(); }}
          onClose={handleClose}
        />
      </BottomSheet>
    </>
  );
}
