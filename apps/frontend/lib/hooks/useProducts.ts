import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk, type ProductsPageFilters } from '@/lib/query-keys';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ProductType = 'product' | 'service';

/** État exclusif du stock : négatif (< 0), rupture (= 0), faible (≤ seuil), en stock. */
export type StockState = 'negative' | 'out' | 'low' | 'in';

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
  is_negative_stock: boolean;
  stock_state: StockState;
  /** Vrai si le format n'a jamais servi (aucune vente, aucun mouvement hors stock initial). */
  can_delete: boolean;
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
  /** Stock initial d'un nouveau format, enregistré dans la même transaction. */
  initial_stock?: string | null;
}

export interface Product {
  id: string;
  name: string;
  type: ProductType;
  description: string;
  is_active: boolean;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  is_negative_stock: boolean;
  /** État exclusif du stock ; `null` pour un service. */
  stock_state: StockState | null;
  primary_image: string | null;
  updated_at: string;
  /** Agrégats calculés à partir des variantes actives. */
  min_selling_price: string | null;
  max_selling_price: string | null;
  variant_count: number;
  /** Stock total des formats actifs (liste seulement) ; `null` pour un service. */
  total_stock?: string | null;
}

/** Photo d'un article : `url` signée (lecture seule, expire), `null` si le stockage n'est pas configuré. */
export interface ProductImage {
  id: string;
  url: string | null;
  is_primary: boolean;
  position: number;
  created_at: string;
}

export interface ProductDetail extends Product {
  images: ProductImage[];
  variants: ProductVariant[];
  created_at: string;
  /** Vrai si l'article n'a jamais servi (aucune ligne de commande, aucun mouvement hors stock initial). */
  can_delete: boolean;
  /** Stock des formats actifs, négatifs compris ; `null` pour un service. */
  stock_total: string | null;
  /** Valeur d'achat du stock positif ; `null` pour un service ou sans prix d'achat. */
  purchase_value: string | null;
  /** Ventes des 30 derniers jours (commandes annulées exclues). */
  sales_30d: { quantity: number; amount: string };
}

export interface ProductFormData {
  name: string;
  type?: ProductType;
  description?: string;
  /** Création seulement : format unique, créé avec l'article en un seul appel. */
  variant?: ProductVariantFormData;
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
    queryKey: qk.products.list({ search, all, inactive, type, outOfStock, lowStock, ordering }),
    queryFn: () => apiFetch<PaginatedResponse<Product>>(`/products/?${params}`),
  });
}

function pageParams(filters: ProductsPageFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ['state', 'type', 'stock', 'search', 'ordering'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** Page de la liste Articles (desktop) : filtres, tri et pagination côté serveur. */
export function useProductsPage(filters: ProductsPageFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.products.page(filters),
    queryFn: () => apiFetch<PaginatedResponse<Product>>(`/products/?${pageParams(filters)}`),
    enabled: options?.enabled,
  });
}

/** Liste Articles mobile : pages chargées à la suite (« Charger plus »). */
export function useProductsInfinite(filters: Omit<ProductsPageFilters, 'page'>, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: qk.products.listInfinite(filters),
    queryFn: ({ pageParam = 1 }) =>
      apiFetch<PaginatedResponse<Product>>(`/products/?${pageParams({ ...filters, page: pageParam as number })}`),
    initialPageParam: 1 as number,
    getNextPageParam: (last, _, lastPageParam) =>
      last.next ? (lastPageParam as number) + 1 : undefined,
    enabled: options?.enabled,
  });
}

/** Nombre d'articles par option de chaque filtre (mêmes filtres que la liste). */
export interface ProductsFacets {
  state: Record<'all' | 'active' | 'inactive', number>;
  type: Record<'all' | ProductType, number>;
  stock: Record<'all' | StockState, number>;
}

export function useProductsFacets(filters: Omit<ProductsPageFilters, 'page'>, options?: { enabled?: boolean }) {
  // Le tri ne change pas les nombres : il reste hors de la clé de cache.
  const facetFilters = { ...filters, ordering: undefined };
  return useQuery({
    queryKey: qk.products.facets(facetFilters),
    queryFn: () => apiFetch<ProductsFacets>(`/products/facets/?${pageParams(facetFilters)}`),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

export interface ProductsSummary {
  total: number;
  products: number;
  services: number;
  negative_stock: number;
  out_of_stock: number;
  low_stock: number;
  inactive: number;
}

export function useProductsSummary() {
  return useQuery({
    queryKey: qk.products.summary,
    queryFn: () => apiFetch<ProductsSummary>('/products/summary/'),
  });
}

export function productDetailQueryOptions(id: string) {
  return {
    queryKey: qk.products.detail(id),
    queryFn: () => apiFetch<ProductDetail>(`/products/${id}/`),
  };
}

/**
 * Fiche chargée au moment d'un ajout à la commande : échoue tout de suite hors ligne
 * (au lieu d'attendre le retour du réseau), pour afficher un message près du bouton.
 */
export function productPickQueryOptions(id: string) {
  return { ...productDetailQueryOptions(id), networkMode: 'always' as const, retry: false };
}

export function useProduct(id: string) {
  return useQuery({
    ...productDetailQueryOptions(id),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductFormData) =>
      apiFetch<ProductDetail>('/products/', { method: 'POST', body: JSON.stringify(data) }),
    // Un article créé avec son format apparaît aussi dans les niveaux et la recherche du stock.
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: qk.products.all }), qc.invalidateQueries({ queryKey: qk.stock.all })]),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProductFormData>) =>
      apiFetch<ProductDetail>(`/products/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products.all }),
  });
}

export function useDeactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/products/${id}/deactivate/`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products.all }),
  });
}

export function useReactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/products/${id}/reactivate/`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.products.all }),
  });
}

/** Suppression d'un article jamais utilisé (le serveur répond 409 sinon). */
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/products/${id}/`, { method: 'DELETE' }),
    // La fiche supprimée, encore affichée le temps de la navigation, n'est pas redemandée (404) :
    // listes et stock se rechargent à leur prochain affichage ; les badges de navigation tout de suite.
    onSuccess: () => {
      for (const queryKey of [qk.products.all, qk.stock.all, qk.dashboard.all]) {
        void qc.invalidateQueries({ queryKey, refetchType: 'none' });
      }
      void qc.invalidateQueries({ queryKey: qk.navBadges.all });
    },
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
      qc.invalidateQueries({ queryKey: qk.products.detail(productId) });
      qc.invalidateQueries({ queryKey: qk.products.all });
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
      qc.invalidateQueries({ queryKey: qk.products.detail(productId) });
      qc.invalidateQueries({ queryKey: qk.products.all });
    },
  });
}

export function useDeleteProductVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) =>
      apiFetch(`/products/${productId}/variants/${variantId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products.detail(productId) });
      qc.invalidateQueries({ queryKey: qk.products.all });
    },
  });
}

/** Retire un format de la vente ou l'y remet (menu « ⋯ » de la fiche). */
export function useSetProductVariantActive(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, isActive }: { variantId: string; isActive: boolean }) =>
      apiFetch<ProductVariant>(`/products/${productId}/variants/${variantId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: isActive }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.products.detail(productId) });
      qc.invalidateQueries({ queryKey: qk.products.all });
    },
  });
}
