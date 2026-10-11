'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_VARIANT_NAME } from '@/lib/products';
import type { ProductDetail, ProductVariant, ProductVariantFormData } from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';
import type { ProductFormValues } from './useProductForm';

/** Montant ou quantité saisi avec une virgule (« 12,50 ») tel que l'API l'attend. */
const decimal = (value: string) => value.trim().replace(',', '.');
const optionalDecimal = (value: string) => (value.trim() ? decimal(value) : null);

/** Champs du format réglés par le formulaire : prix pour tous, achat, seuil et références pour un article. */
function variantFields(values: ProductFormValues): Partial<ProductVariantFormData> {
  if (values.type === 'service') return { selling_price: decimal(values.selling_price) };
  return {
    selling_price: decimal(values.selling_price),
    purchase_price: optionalDecimal(values.purchase_price),
    low_stock_threshold: optionalDecimal(values.low_stock_threshold),
    sku: values.sku.trim(),
    barcode: values.barcode.trim(),
  };
}

async function uploadPhoto(productId: string, file: File): Promise<void> {
  const body = new FormData();
  body.append('image', file);
  const res = await fetch(`/api/proxy/products/${productId}/images/`, { method: 'POST', body });
  if (!res.ok) throw new Error(`upload ${res.status}`);
}

/** Exécute les étapes qui suivent l'enregistrement de l'article ; `false` si l'une a échoué. */
async function runExtras(steps: (() => Promise<unknown>)[]): Promise<boolean> {
  const results = await Promise.allSettled(steps.map((step) => step()));
  return results.every((r) => r.status === 'fulfilled');
}

/**
 * Création et modification d'un article : l'article, puis son format unique, puis la photo et le
 * stock initial (entrée de stock, jamais une écriture directe). Résout l'identifiant et `complete`.
 */
export function useSaveProduct() {
  const tDetail = useTranslations('articles.detail');
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function run<T>(work: () => Promise<T>): Promise<T> {
    setSaving(true);
    try {
      return await work();
    } finally {
      setSaving(false);
      void qc.invalidateQueries({ queryKey: qk.products.all });
    }
  }

  const create = (values: ProductFormValues, photo: File | null) => run(async () => {
    const body = { name: values.name.trim(), type: values.type, description: values.description.trim() };
    const product = await apiFetch<ProductDetail>('/products/', { method: 'POST', body: JSON.stringify(body) });
    const variant = await apiFetch<ProductVariant>(`/products/${product.id}/variants/`, {
      method: 'POST',
      body: JSON.stringify({
        ...variantFields(values), packaging_name: DEFAULT_VARIANT_NAME, base_quantity: '1',
        unit: values.type === 'product' ? values.unit : 'piece',
      }),
    });
    const stock = values.type === 'product' ? optionalDecimal(values.initial_stock) : null;
    const complete = await runExtras([
      ...(photo ? [() => uploadPhoto(product.id, photo)] : []),
      ...(stock && Number(stock) > 0 ? [() => apiFetch('/stock/in/', {
        method: 'POST',
        body: JSON.stringify({ variant: variant.id, quantity: stock, reason: tDetail('initial_stock_reason') }),
      })] : []),
    ]);
    return { id: product.id, complete };
  });

  const update = (product: ProductDetail, variant: ProductVariant | null, values: ProductFormValues, photo: File | null) => run(async () => {
    const body = { name: values.name.trim(), description: values.description.trim() };
    await apiFetch(`/products/${product.id}/`, { method: 'PATCH', body: JSON.stringify(body) });
    if (variant) {
      await apiFetch(`/products/${product.id}/variants/${variant.id}/`, { method: 'PATCH', body: JSON.stringify(variantFields(values)) });
    }
    const complete = await runExtras(photo ? [() => uploadPhoto(product.id, photo)] : []);
    return { id: product.id, complete };
  });

  return { create, update, saving };
}
