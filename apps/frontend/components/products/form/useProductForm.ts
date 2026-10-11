'use client';

import { useMemo } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useFormSections } from '@/components/form/useFormSections';
import { ApiError } from '@/lib/api-client';
import type { ProductDetail, ProductType, ProductUnit, ProductVariant } from '@/lib/hooks/useProducts';
import { notify } from '@/lib/notify';
import { useProductPhotos, type PhotoChanges } from './useProductPhotos';

export const UNITS = ['piece', 'g', 'kg', 'mL', 'L', 'm'] as const;

/** Clé du libellé d'une unité dans `articles.units`. */
export const UNIT_NAMES = { piece: 'piece', g: 'gram', kg: 'kilogram', mL: 'milliliter', L: 'liter', m: 'meter' } as const satisfies Record<ProductUnit, string>;

/** Ordre d'affichage : la première erreur dans cet ordre reçoit le focus. */
const FIELDS = ['name', 'description', 'selling_price', 'purchase_price', 'initial_stock', 'low_stock_threshold', 'unit', 'sku', 'barcode'] as const;
type ProductField = (typeof FIELDS)[number];
export type ProductSection = 'photo' | 'stock' | 'reference';

const SECTION_OF: Partial<Record<ProductField, ProductSection>> = {
  initial_stock: 'stock', low_stock_threshold: 'stock', sku: 'reference', barcode: 'reference',
};

/** Précision des champs `DecimalField` du modèle : prix (12, 2), quantités (14, 3). */
const AMOUNT = /^\d{1,10}(?:[.,]\d{1,2})?$/;
const QUANTITY = /^\d{1,11}(?:[.,]\d{1,3})?$/;

type Translate = (key: string, values?: { max: number }) => string;

/** `priced` : le formulaire règle le format unique ; `article` : champs de stock et de référence. */
function productSchema(t: Translate, { priced, article }: { priced: boolean; article: boolean }) {
  const text = (max: number) => z.string().trim().max(max, t('too_long', { max }));
  const optional = (pattern: RegExp, message: string) =>
    article ? z.string().trim().refine((v) => v === '' || pattern.test(v), t(message)) : z.string();
  return z.object({
    type: z.enum(['product', 'service']),
    name: text(200).min(1, t('name_required')),
    selling_price: priced
      ? z.string().trim().min(1, t('price_required')).regex(AMOUNT, t('amount_invalid'))
      : z.string(),
    unit: z.enum(UNITS),
    purchase_price: optional(AMOUNT, 'amount_invalid'),
    initial_stock: optional(QUANTITY, 'quantity_invalid'),
    low_stock_threshold: optional(QUANTITY, 'quantity_invalid'),
    sku: article ? text(64) : z.string(),
    barcode: article ? text(64) : z.string(),
    description: z.string(),
  });
}

export type ProductFormValues = z.infer<ReturnType<typeof productSchema>>;

/** Quantité enregistrée (« 5.000 ») telle qu'on la saisit (« 5 »). */
const quantity = (value: string | null | undefined) => (value == null ? '' : String(Number(value)));

function defaultValues(type: ProductType, product: ProductDetail | undefined, variant: ProductVariant | null): ProductFormValues {
  return {
    type, name: product?.name ?? '', description: product?.description ?? '',
    selling_price: variant?.selling_price ?? '', unit: variant?.unit ?? 'piece',
    purchase_price: variant?.purchase_price ?? '', initial_stock: '',
    low_stock_threshold: quantity(variant?.low_stock_threshold),
    sku: variant?.sku ?? '', barcode: variant?.barcode ?? '',
  };
}

/** Champs en erreur renvoyés par l'API (`{detail, errors: {champ: [...]}}`), dans l'ordre d'affichage. */
function serverFieldErrors(err: unknown): ProductField[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const errors = (err.data as { errors?: unknown } | null)?.errors;
  return errors && typeof errors === 'object' ? FIELDS.filter((f) => f in errors) : [];
}

interface ProductFormOptions {
  mode: 'create' | 'edit';
  type: ProductType;
  product?: ProductDetail;
  /** Format réglé par le formulaire ; `null` en modification d'un article à plusieurs formats. */
  variant: ProductVariant | null;
  /** Résout `false` si l'article est enregistré mais que ses photos ne l'ont pas toutes été. */
  onSubmit: (values: ProductFormValues, photos: PhotoChanges | null) => Promise<boolean>;
  /** Carte ouverte à l'arrivée (« Gérer les photos » depuis la fiche). */
  initialSection?: ProductSection;
}

/**
 * Valeurs, photos, sections et soumission du formulaire article. Une erreur (schéma ou serveur)
 * ouvre la section de son champ et y place le focus ; succès et échec global sont notifiés.
 */
export function useProductForm({ mode, type, product, variant, onSubmit, initialSection }: ProductFormOptions) {
  const t = useTranslations('articles.form');
  const priced = mode === 'create' || variant !== null;
  const resolver = useMemo<Resolver<ProductFormValues>>(() => (values, context, options) =>
    zodResolver(productSchema(t, { priced, article: values.type === 'product' }))(values, context, options), [t, priced]);
  const form = useForm<ProductFormValues>({ resolver, shouldFocusError: false, defaultValues: defaultValues(type, product, variant) });
  const sections = useFormSections(SECTION_OF, form.setFocus, initialSection ? [initialSection] : []);
  const photos = useProductPhotos(product?.images);

  const onInvalid = (errors: FieldErrors<ProductFormValues>) => {
    const first = FIELDS.find((f) => errors[f]);
    if (first) sections.reveal(first);
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const complete = await onSubmit(values, photos.dirty ? photos.changes() : null);
      if (complete) notify.success(t(mode === 'edit' ? 'toast_saved' : 'toast_created', { type: values.type }));
      else notify.error(t('extras_failed', { type: values.type }));
    } catch (err) {
      const fields = serverFieldErrors(err);
      for (const f of fields) form.setError(f, { type: 'server', message: t(f === 'name' ? 'name_taken' : 'field_invalid') });
      const [first] = fields;
      if (first) sections.reveal(first);
      else notify.error(t('save_failed'));
    }
  }, onInvalid);

  return { form, submit, sections, photos };
}
