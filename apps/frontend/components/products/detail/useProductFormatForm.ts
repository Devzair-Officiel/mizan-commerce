'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { UNITS } from '@/components/products/form/productFormSchema';
import { AMOUNT, QUANTITY, toDecimal } from '@/components/stock/stockSchema';
import { ApiError } from '@/lib/api-client';
import {
  useCreateProductVariant, useUpdateProductVariant,
  type ProductDetail, type ProductVariant, type ProductVariantFormData,
} from '@/lib/hooks/useProducts';
import { isDefaultVariant } from '@/lib/products';
import { notify } from '@/lib/notify';

const FIELDS = ['packaging_name', 'selling_price', 'unit', 'base_quantity', 'purchase_price', 'low_stock_threshold', 'initial_stock', 'sku', 'barcode'] as const;
type FormatField = (typeof FIELDS)[number];

type Translate = (key: string, values?: { max: number }) => string;

/** `named` : nom obligatoire (sauf le format unique, qui garde le sien si on le laisse vide). */
function formatSchema(t: Translate, named: boolean) {
  const text = (max: number) => z.string().trim().max(max, t('too_long', { max }));
  const optional = (pattern: RegExp, message: string) => z.string().trim().refine((v) => v === '' || pattern.test(v), t(message));
  return z.object({
    packaging_name: named ? text(120).min(1, t('format_name_required')) : text(120),
    selling_price: z.string().trim().min(1, t('price_required')).regex(AMOUNT, t('amount_invalid')),
    unit: z.enum(UNITS),
    base_quantity: z.string().trim().refine((v) => QUANTITY.test(v) && Number(toDecimal(v)) > 0, t('quantity_invalid')),
    purchase_price: optional(AMOUNT, 'amount_invalid'),
    low_stock_threshold: optional(QUANTITY, 'quantity_invalid'),
    initial_stock: optional(QUANTITY, 'quantity_invalid'),
    sku: text(64),
    barcode: text(64),
  });
}

export type ProductFormatValues = z.infer<ReturnType<typeof formatSchema>>;

const quantity = (value: string | null | undefined) => (value == null ? '' : String(Number(value)));
const decimalOrNull = (value: string) => (value ? toDecimal(value) : null);

function defaultValues(variant: ProductVariant | null, unit: ProductVariant['unit']): ProductFormatValues {
  return {
    packaging_name: variant && !isDefaultVariant(variant.packaging_name) ? variant.packaging_name : '',
    selling_price: variant?.selling_price ?? '', unit: variant?.unit ?? unit,
    base_quantity: quantity(variant?.base_quantity ?? '1'), purchase_price: variant?.purchase_price ?? '',
    low_stock_threshold: quantity(variant?.low_stock_threshold), initial_stock: '',
    sku: variant?.sku ?? '', barcode: variant?.barcode ?? '',
  };
}

/** Valeurs saisies au format de l'API ; un service n'a ni stock, ni seuil, ni quantité de base. */
function payloadOf(values: ProductFormatValues, variant: ProductVariant | null, isArticle: boolean): ProductVariantFormData {
  return {
    packaging_name: values.packaging_name || (variant?.packaging_name ?? ''),
    selling_price: toDecimal(values.selling_price), unit: values.unit,
    base_quantity: isArticle ? toDecimal(values.base_quantity) : '1',
    purchase_price: decimalOrNull(values.purchase_price),
    low_stock_threshold: isArticle ? decimalOrNull(values.low_stock_threshold) : null,
    sku: values.sku, barcode: values.barcode,
    ...(!variant && isArticle ? { initial_stock: decimalOrNull(values.initial_stock) } : {}),
  };
}

/** Champs refusés par l'API (`{detail, errors: {champ: [...]}}`), dans l'ordre d'affichage. */
function serverFieldErrors(err: unknown): FormatField[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const errors = (err.data as { errors?: unknown } | null)?.errors;
  return errors && typeof errors === 'object' ? FIELDS.filter((f) => f in errors) : [];
}

/** Ajout ou modification d'un format depuis la fiche (RHF + Zod, erreurs serveur sur leur champ). */
export function useProductFormatForm(product: ProductDetail, variant: ProductVariant | null, onDone: () => void) {
  const t = useTranslations('articles.sheet.format');
  const isArticle = product.type === 'product';
  const named = !variant || !isDefaultVariant(variant.packaging_name);
  const [first] = product.variants;
  const schema = useMemo(() => formatSchema(t, named), [t, named]);
  const form = useForm<ProductFormatValues>({ resolver: zodResolver(schema), defaultValues: defaultValues(variant, first?.unit ?? 'piece') });
  const create = useCreateProductVariant(product.id);
  const update = useUpdateProductVariant(product.id, variant?.id ?? '');

  const submit = form.handleSubmit(async (values) => {
    const payload = payloadOf(values, variant, isArticle);
    try {
      if (variant) await update.mutateAsync(payload);
      else await create.mutateAsync(payload);
      notify.success(t(variant ? 'saved' : 'created'));
      onDone();
    } catch (err) {
      const fields = serverFieldErrors(err);
      for (const f of fields) form.setError(f, { type: 'server', message: t(f === 'packaging_name' ? 'name_taken' : 'field_invalid') });
      const [field] = fields;
      if (field) form.setFocus(field);
      else notify.error(t('save_failed'));
    }
  });

  return { form, submit, isArticle, pending: create.isPending || update.isPending };
}
