import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ProductType = 'product' | 'service';

export type ProductUnit = 'piece' | 'g' | 'kg' | 'mL' | 'L' | 'm';

export const UNIT_LABELS: Record<ProductUnit, string> = {
  piece: 'pièce',
  g: 'g',
  kg: 'kg',
  mL: 'mL',
  L: 'L',
  m: 'm',
};

/**
 * Format un stock pour l'affichage. Sémantique : qty = nombre de formats en stock.
 *
 * - Vrac (`base_quantity = 1`, unit ≠ piece) → "12,5 kg" (un format = une unité de contenu)
 * - Pièce (`unit = piece`)                   → "13 pièces"
 * - Format composé (`base_quantity > 1`)     → "50 en stock" (ambigu sans contexte ;
 *                                                packagingName si fourni → "50 bouteilles")
 */
export function formatStock(
  qty: string | number,
  unit: ProductUnit,
  options?: { baseQuantity?: string | number; packagingName?: string },
): string {
  const num = typeof qty === 'string' ? parseFloat(qty) : qty;
  const trimmed = Number.isInteger(num) ? num.toString() : num.toString().replace(/\.?0+$/, '');
  const baseQty = options?.baseQuantity != null
    ? (typeof options.baseQuantity === 'string' ? parseFloat(options.baseQuantity) : options.baseQuantity)
    : 1;

  if (unit === 'piece') {
    return num <= 1 ? `${trimmed} pièce` : `${trimmed} pièces`;
  }
  if (baseQty === 1) {
    return `${trimmed} ${unit}`;
  }
  // Format composé : on compte des conteneurs, pas du contenu.
  if (options?.packagingName) {
    return `${trimmed} ${options.packagingName}`;
  }
  return `${trimmed} en stock`;
}

/** Formate une fourchette de prix : si min==max, retourne juste le prix. */
export function formatPriceRange(min: string | null, max: string | null): string | null {
  if (!min || !max) return null;
  if (min === max) return min;
  return `${min} – ${max}`;
}

/**
 * Prix unitaire d'une variante : `prix / quantité de base`, formaté `XX,XX €/{unit}`.
 * Retourne `null` pour les piéces vendues à l'unité (le prix EST déjà le prix unitaire).
 *
 * Conversion automatique vers l'unité commerciale standard : mL → L, g → kg.
 * Les commerçants lisent les prix en €/L ou €/kg (rayons supermarché),
 * jamais en €/mL ou €/g, même quand le conditionnement est plus petit.
 */
export function formatUnitPrice(
  sellingPrice: string,
  baseQuantity: string,
  unit: ProductUnit,
): string | null {
  const price = parseFloat(sellingPrice);
  const qty = parseFloat(baseQuantity);
  if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
  if (unit === 'piece' && qty === 1) return null;

  let unitPrice = price / qty;
  let displayUnit: string = unit === 'piece' ? 'pièce' : unit;
  if (unit === 'mL') {
    unitPrice *= 1000;
    displayUnit = 'L';
  } else if (unit === 'g') {
    unitPrice *= 1000;
    displayUnit = 'kg';
  }

  const decimals = unitPrice < 1 ? 3 : 2;
  const formatted = unitPrice.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted} €/${displayUnit}`;
}

export interface ProductVariant {
  id: string;
  product: string;
  packaging_name: string;
  unit: ProductUnit;
  base_quantity: string;
  selling_price: string;
  purchase_price: string | null;
  stock_quantity: string;
  low_stock_threshold: string | null;
  sku: string;
  barcode: string;
  position: number;
  is_active: boolean;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  updated_at: string;
}

export interface ProductVariantFormData {
  packaging_name: string;
  unit: ProductUnit;
  base_quantity: string;
  selling_price: string;
  purchase_price?: string | null;
  low_stock_threshold?: string | null;
  sku?: string;
  barcode?: string;
  position?: number;
  is_active?: boolean;
}

export interface Product {
  id: string;
  name: string;
  type: ProductType;
  description: string;
  is_active: boolean;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  primary_image: string | null;
  updated_at: string;
  /** Agrégats calculés à partir des variantes actives. */
  min_selling_price: string | null;
  max_selling_price: string | null;
  variant_count: number;
}

export interface ProductDetail extends Product {
  images: { id: string; object_key: string; is_primary: boolean; position: number }[];
  variants: ProductVariant[];
  created_at: string;
}

export interface ProductFormData {
  name: string;
  type?: ProductType;
  description?: string;
}

export type ProductOrdering = 'name' | '-name' | '-created_at';

export interface ProductsQueryOptions {
  search?: string;
  all?: boolean;
  inactive?: boolean;
  type?: ProductType;
  outOfStock?: boolean;
  lowStock?: boolean;
  ordering?: ProductOrdering;
}

export function useProducts(options: ProductsQueryOptions = {}) {
  const { search, all, inactive, type, outOfStock, lowStock, ordering } = options;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (all) params.set('all', '1');
  if (inactive) params.set('inactive', '1');
  if (type) params.set('type', type);
  if (outOfStock) params.set('out_of_stock', '1');
  if (lowStock) params.set('low_stock', '1');
  if (ordering) params.set('ordering', ordering);
  return useQuery({
    queryKey: ['products', { search, all, inactive, type, outOfStock, lowStock, ordering }],
    queryFn: () => apiFetch<PaginatedResponse<Product>>(`/products/?${params}`),
  });
}

export interface ProductsSummary {
  total: number;
  products: number;
  services: number;
  out_of_stock: number;
  low_stock: number;
  inactive: number;
}

export function useProductsSummary() {
  return useQuery({
    queryKey: ['products', 'summary'],
    queryFn: () => apiFetch<ProductsSummary>('/products/summary/'),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: () => apiFetch<ProductDetail>(`/products/${id}/`),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductFormData) =>
      apiFetch<ProductDetail>('/products/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProductFormData>) =>
      apiFetch<ProductDetail>(`/products/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/products/${id}/deactivate/`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useReactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/products/${id}/reactivate/`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUploadProductImage(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`/api/proxy/products/${productId}/images/`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? 'Erreur upload');
      }
      return res.json() as Promise<{ id: string; object_key: string; url: string; is_primary: boolean }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products', productId] }),
  });
}

// ── Variants ───────────────────────────────────────────────────────────────────

export function useCreateProductVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductVariantFormData) =>
      apiFetch<ProductVariant>(`/products/${productId}/variants/`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateProductVariant(productId: string, variantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProductVariantFormData>) =>
      apiFetch<ProductVariant>(`/products/${productId}/variants/${variantId}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProductVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) =>
      apiFetch(`/products/${productId}/variants/${variantId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
