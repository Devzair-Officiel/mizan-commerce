'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_VARIANT_NAME } from '@/lib/products';
import type { ProductDetail } from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';
import type { FormatRow, ProductFormValues } from './productFormSchema';
import type { PhotoChanges } from './useProductPhotos';

/** Montant ou quantité saisi avec une virgule (« 12,50 ») tel que l'API l'attend. */
const decimal = (value: string) => value.trim().replace(',', '.');
const optionalDecimal = (value: string) => (value.trim() ? decimal(value) : null);

/**
 * Une ligne du formulaire telle que l'attend l'API (`variants`). Format existant : son identifiant
 * (son stock ne change que par une entrée) ; nouveau format : unité de l'article et stock initial.
 * Le format unique garde son nom, ou prend le nom technique du format par défaut.
 */
function variantRow(row: FormatRow, values: ProductFormValues) {
  const packaging_name = row.name.trim() || DEFAULT_VARIANT_NAME;
  const selling_price = decimal(row.selling_price);
  const created = { unit: values.unit, base_quantity: '1' };
  if (values.type === 'service') return { packaging_name, selling_price, ...created, unit: 'piece' };
  const stock = optionalDecimal(row.initial_stock);
  return {
    ...(row.id ? { id: row.id } : { ...created, ...(stock && Number(stock) > 0 ? { initial_stock: stock } : {}) }),
    packaging_name, selling_price,
    purchase_price: optionalDecimal(row.purchase_price),
    low_stock_threshold: optionalDecimal(row.low_stock_threshold),
    sku: row.sku.trim(),
    barcode: row.barcode.trim(),
    is_active: row.is_active,
  };
}

/** Lignes envoyées : le tableau des formats d'un article, ou l'unique ligne (format unique, service). */
const variantRows = (values: ProductFormValues) =>
  (values.type === 'product' && values.multi ? values.formats : values.formats.slice(0, 1)).map((row) => variantRow(row, values));

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
 * Création et modification d'un article : l'article, ses formats et leurs stocks initiaux en un seul
 * appel (tout ou rien), puis les photos. Un service modifié garde ses autres formats (fiche).
 * Résout l'identifiant et `complete`.
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
    const body = { name: values.name.trim(), type: values.type, description: values.description.trim(), variants: variantRows(values) };
    const product = await apiFetch<ProductDetail>('/products/', { method: 'POST', body: JSON.stringify(body) });
    const complete = await syncPhotos(product.id, photos);
    return { id: product.id, complete };
  });

  const update = (product: ProductDetail, values: ProductFormValues, photos: PhotoChanges | null) => run(async () => {
    const article = values.type === 'product';
    const body = { name: values.name.trim(), description: values.description.trim(), ...(article ? { variants: variantRows(values) } : {}) };
    await apiFetch(`/products/${product.id}/`, { method: 'PATCH', body: JSON.stringify(body) });
    const [service] = article ? [] : values.formats;
    if (service?.id) {
      await apiFetch(`/products/${product.id}/variants/${service.id}/`, { method: 'PATCH', body: JSON.stringify({ selling_price: decimal(service.selling_price) }) });
    }
    const complete = await syncPhotos(product.id, photos);
    return { id: product.id, complete };
  });

  return { create, update, saving };
}
