'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import { useCreateProduct, type ProductFormData } from '@/lib/hooks/useProducts';
import { notify } from '@/lib/notify';
import { DEFAULT_VARIANT_NAME } from '@/lib/products';
import { AMOUNT, toDecimal } from '../stockSchema';
import { cleanInvoiceLabel } from './cleanInvoiceLabel';
import type { PickedVariant } from './InvoiceLinePickerSheet';

type Translate = (key: string, values?: { max: number }) => string;

function quickCreateSchema(t: Translate) {
  return z.object({
    name: z.string().trim().min(1, t('name_required')).max(200, t('too_long', { max: 200 })),
    selling_price: z.string().trim().min(1, t('price_required')).regex(AMOUNT, t('amount_invalid')),
    purchase_price: z.string().trim().refine((v) => v === '' || AMOUNT.test(v), t('amount_invalid')),
  });
}

export type InvoiceQuickCreateValues = z.infer<ReturnType<typeof quickCreateSchema>>;

/** Article au format unique (unité : pièce), créé avec son format en un seul appel. */
function payloadOf(values: InvoiceQuickCreateValues): ProductFormData {
  return {
    name: values.name, type: 'product',
    variant: {
      packaging_name: DEFAULT_VARIANT_NAME, unit: 'piece', base_quantity: '1',
      selling_price: toDecimal(values.selling_price),
      purchase_price: values.purchase_price ? toDecimal(values.purchase_price) : null,
    },
  };
}

/** Champ refusé par l'API (`{detail, errors: {name | variant: {...}}}`), `null` sinon. */
function serverField(err: unknown): 'name' | 'selling_price' | 'purchase_price' | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const errors = (err.data as { errors?: Record<string, unknown> } | null)?.errors;
  if (!errors || typeof errors !== 'object') return null;
  if ('name' in errors) return 'name';
  const variant = errors.variant;
  if (!variant || typeof variant !== 'object') return null;
  return 'purchase_price' in variant ? 'purchase_price' : 'selling_price';
}

/**
 * « Créer cet article » depuis une ligne de facture : nom lu (sans codes), prix d'achat de la ligne,
 * prix de vente à saisir. L'article créé est rendu pour être associé à la ligne.
 */
export function useInvoiceQuickCreate(readLabel: string, purchasePrice: string, onCreated: (picked: PickedVariant) => void) {
  const t = useTranslations('articles.form');
  const ti = useTranslations('stock.invoice');
  const schema = useMemo(() => quickCreateSchema(t), [t]);
  const form = useForm<InvoiceQuickCreateValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: cleanInvoiceLabel(readLabel), selling_price: '', purchase_price: purchasePrice },
  });
  const create = useCreateProduct();

  const submit = form.handleSubmit(async (values) => {
    try {
      const product = await create.mutateAsync(payloadOf(values));
      const [variant] = product.variants;
      if (!variant) throw new Error('format manquant');
      notify.success(ti('create_success', { name: product.name }));
      onCreated({ variant: variant.id, name: product.name, packaging: variant.packaging_name });
    } catch (err) {
      const field = serverField(err);
      if (field === null) { notify.error(ti('create_failed')); return; }
      form.setError(field, { type: 'server', message: t(field === 'name' ? 'name_taken' : 'field_invalid') });
      form.setFocus(field);
    }
  });

  return { form, submit, pending: create.isPending };
}
