'use client';

import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FieldSuffix } from '@/components/form/FieldSuffix';
import { FormField } from '@/components/form/FormField';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_CONTROL, FIELD_READONLY } from '@/components/form/fieldStyles';
import { UNIT_NAMES, UNITS } from '@/components/products/form/productFormSchema';
import type { ProductFormatValues } from './useProductFormatForm';

interface ProductFormatFieldsProps {
  form: UseFormReturn<ProductFormatValues>;
  isArticle: boolean;
  creating: boolean;
  currency: string;
}

const NUMBER = `${FIELD_CONTROL} pe-16 tabular-nums`;

/** Champs d'un format : nom et prix ; pour un article, unité, contenance, stock initial et seuil ; achat et références. */
export function ProductFormatFields({ form, isArticle, creating, currency }: ProductFormatFieldsProps) {
  const t = useTranslations('articles.sheet.format');
  const tForm = useTranslations('articles.form');
  const tUnits = useTranslations('articles.units');
  const { register, control, formState: { errors } } = form;
  const unit = useWatch({ control, name: 'unit' });
  const unitSuffix = tForm('unit_short', { unit });
  const decimal = { inputMode: 'decimal', autoComplete: 'off' } as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label={t('name', { type: isArticle ? 'product' : 'service' })} required={creating} help={t('name_help')} error={errors.packaging_name?.message}>
        {(c) => <input {...c} {...register('packaging_name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={tForm('selling_price')} required error={errors.selling_price?.message}>
        {(c) => <FieldSuffix suffix={currency}><input {...c} {...register('selling_price')} {...decimal} className={NUMBER} /></FieldSuffix>}
      </FormField>
      {isArticle && (
        <FormField label={tForm('unit')} required={creating} help={creating ? tForm('unit_help') : undefined}>
          {(c) => creating
            ? <Controller control={control} name="unit" render={({ field }) => (
                <FormSelect control={c} value={field.value} onChange={field.onChange} triggerRef={field.ref}
                  options={UNITS.map((u) => ({ value: u, label: tUnits(UNIT_NAMES[u]) }))} />
              )} />
            : <output {...c} className={`${FIELD_READONLY} text-muted-foreground`}>{tUnits(UNIT_NAMES[unit])}</output>}
        </FormField>
      )}
      {isArticle && (
        <FormField label={t('base_quantity')} required help={t('base_quantity_help')} error={errors.base_quantity?.message}>
          {(c) => <FieldSuffix suffix={unitSuffix}><input {...c} {...register('base_quantity')} {...decimal} className={NUMBER} /></FieldSuffix>}
        </FormField>
      )}
      <FormField label={tForm('purchase_price')} error={errors.purchase_price?.message}>
        {(c) => <FieldSuffix suffix={currency}><input {...c} {...register('purchase_price')} {...decimal} className={NUMBER} /></FieldSuffix>}
      </FormField>
      {isArticle && creating && (
        <FormField label={tForm('initial_stock')} help={tForm('initial_stock_help')} error={errors.initial_stock?.message}>
          {(c) => <input {...c} {...register('initial_stock')} {...decimal} className={`${FIELD_CONTROL} tabular-nums`} />}
        </FormField>
      )}
      {isArticle && (
        <FormField label={tForm('threshold')} error={errors.low_stock_threshold?.message}>
          {(c) => <input {...c} {...register('low_stock_threshold')} {...decimal} className={`${FIELD_CONTROL} tabular-nums`} />}
        </FormField>
      )}
      <FormField label={tForm('sku')} error={errors.sku?.message}>
        {(c) => <input {...c} {...register('sku')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      {isArticle && (
        <FormField label={tForm('barcode')} error={errors.barcode?.message}>
          {(c) => <input {...c} {...register('barcode')} inputMode="numeric" autoComplete="off" className={`${FIELD_CONTROL} tabular-nums`} />}
        </FormField>
      )}
    </div>
  );
}
