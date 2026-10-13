'use client';

import { useId, useMemo } from 'react';
import Link from 'next/link';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { useStockEntry } from '@/lib/hooks/useStock';
import { notify } from '@/lib/notify';
import { QuantityStepper, parseQuantity } from '../QuantityStepper';
import { amountField, quantityField, toDecimal } from '../stockSchema';
import { useStockFormat } from '../useStockFormat';
import { StockBeforeAfter } from '../StockBeforeAfter';

export interface QuickEntryVariant {
  id: string;
  product_name: string;
  packaging_name: string;
  stock_quantity: string;
  purchase_price: string | null;
}

interface QuickEntryFormProps {
  variant: QuickEntryVariant;
  currencyCode: string;
  onClose: () => void;
}

function quickEntrySchema(t: (key: 'quantity_invalid' | 'amount_invalid') => string) {
  return z.object({ quantity: quantityField(t), price: amountField(t) });
}
type QuickEntryValues = z.infer<ReturnType<typeof quickEntrySchema>>;

/** Quantité reçue et prix d'achat d'un format ; le prix est prérempli avec le dernier payé. */
export function QuickEntryForm({ variant, currencyCode, onClose }: QuickEntryFormProps) {
  const t = useTranslations('stock.quick');
  const tc = useTranslations('stock.common');
  const formId = useId();
  const f = useStockFormat();
  const entry = useStockEntry();
  const schema = useMemo(() => quickEntrySchema(tc), [tc]);
  const { control, register, handleSubmit, formState: { errors } } = useForm<QuickEntryValues>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: '1', price: variant.purchase_price ?? '' },
  });
  const quantity = parseQuantity(useWatch({ control, name: 'quantity' }));
  const name = f.variantLabel(variant.product_name, variant.packaging_name);
  const currency = currencyCode === 'EUR' ? '€' : currencyCode;

  const submit = handleSubmit(({ quantity: qty, price }) => entry.mutate(
    { lines: [{ variant: variant.id, quantity: toDecimal(qty), unit_purchase_price: price ? toDecimal(price) : null }] },
    {
      onSuccess: () => { notify.success(t('success', { quantity: f.quantity(toDecimal(qty)), name })); onClose(); },
      onError: () => notify.error(tc('save_error')),
    },
  ));

  return (
    <BottomSheet open onClose={onClose} title={t('title')} description={name} footer={
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-4">{tc('cancel')}</Button>
        <Button type="submit" form={formId} disabled={entry.isPending} className="h-11 flex-1 rounded-full px-5 font-semibold lg:flex-none">
          {Number.isFinite(quantity) && quantity > 0 ? t('submit', { quantity: f.quantity(quantity) }) : t('submit_empty')}
        </Button>
      </div>
    }>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <StockBeforeAfter before={variant.stock_quantity} added={quantity} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('quantity')} required error={errors.quantity?.message}>
            {(c) => (
              <Controller control={control} name="quantity" render={({ field }) => (
                <QuantityStepper {...c} ref={field.ref} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )} />
            )}
          </FormField>
          <FormField label={t('price')} help={t('price_help')} error={errors.price?.message}>
            {(c) => (
              <FieldSuffix suffix={currency}>
                <input {...c} {...register('price')} inputMode="decimal" autoComplete="off" className={`${FIELD_CONTROL} pe-10 tabular-nums`} />
              </FieldSuffix>
            )}
          </FormField>
        </div>
        <Link href={`/stock/entree?variant=${variant.id}`} className="text-sm font-medium text-primary hover:underline">
          {t('full_entry')}
        </Link>
      </form>
    </BottomSheet>
  );
}
