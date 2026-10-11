'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_VARIANT_NAME } from '@/lib/products';
import type { ProductDetail, ProductVariant, ProductVariantFormData } from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';
import type { ProductFormValues } from './useProductForm';
import type { PhotoChanges } from './useProductPhotos';

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

/** Envoi multipart par le proxy (`apiFetch` fixe le type JSON) ; renvoie la photo créée ou remplacée. */
async function sendPhoto(path: string, method: 'POST' | 'PUT', file: File): Promise<{ id: string }> {
  const body = new FormData();
  body.append('image', file);
  const res = await fetch(`/api/proxy/products/${path}`, { method, body });
  if (!res.ok) throw new Error(`photo ${res.status}`);
  return res.json() as Promise<{ id: string }>;
}

/**
 * Applique les changements de photos, l'un après l'autre (le serveur numérote les positions) :
 * retraits, recadrages, ajouts, puis choix de la principale. Résout `false` si l'un a échoué.
 */
async function syncPhotos(productId: string, changes: PhotoChanges | null): Promise<boolean> {
  if (!changes) return true;
  const images = `${productId}/images`;
  try {
    for (const id of changes.removed) await apiFetch(`/products/${images}/${id}/`, { method: 'DELETE' });
    for (const { id, file } of changes.replaced) await sendPhoto(`${images}/${id}/file/`, 'PUT', file);
    const added = new Map<string, string>();
    for (const { key, file } of changes.added) added.set(key, (await sendPhoto(`${images}/`, 'POST', file)).id);
    const primary = changes.primary && ('id' in changes.primary ? changes.primary.id : added.get(changes.primary.key));
    if (primary) await apiFetch(`/products/${images}/${primary}/`, { method: 'PATCH', body: JSON.stringify({ is_primary: true }) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Création et modification d'un article : l'article avec son format unique et son stock initial
 * (un seul appel, tout ou rien), puis les photos. Résout l'identifiant et `complete`.
 */
export function useSaveProduct() {
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

  const create = (values: ProductFormValues, photos: PhotoChanges | null) => run(async () => {
    const stock = values.type === 'product' ? optionalDecimal(values.initial_stock) : null;
    // Un seul appel : l'article, son format et le stock initial sont créés ensemble ou pas du tout.
    const body = {
      name: values.name.trim(), type: values.type, description: values.description.trim(),
      variant: {
        ...variantFields(values), packaging_name: DEFAULT_VARIANT_NAME, base_quantity: '1',
        unit: values.type === 'product' ? values.unit : 'piece',
      },
      ...(stock && Number(stock) > 0 ? { initial_stock: stock } : {}),
    };
    const product = await apiFetch<ProductDetail>('/products/', { method: 'POST', body: JSON.stringify(body) });
    const complete = await syncPhotos(product.id, photos);
    return { id: product.id, complete };
  });

  const update = (product: ProductDetail, variant: ProductVariant | null, values: ProductFormValues, photos: PhotoChanges | null) => run(async () => {
    const body = { name: values.name.trim(), description: values.description.trim() };
    await apiFetch(`/products/${product.id}/`, { method: 'PATCH', body: JSON.stringify(body) });
    if (variant) {
      await apiFetch(`/products/${product.id}/variants/${variant.id}/`, { method: 'PATCH', body: JSON.stringify(variantFields(values)) });
    }
    const complete = await syncPhotos(product.id, photos);
    return { id: product.id, complete };
  });

  return { create, update, saving };
}
