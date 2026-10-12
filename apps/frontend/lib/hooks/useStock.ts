import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProductUnit, StockState } from '@/lib/hooks/useProducts';
import { qk, type StockLevelsFilters, type StockMovementsFilters } from '@/lib/query-keys';
import { useShowMoreQuery } from '@/lib/hooks/useShowMoreQuery';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type StockMovementType =
  | 'in'
  | 'out'
  | 'reservation'
  | 'release'
  | 'adjustment'
  | 'loss'
  | 'breakage'
  | 'internal_use';

/** Famille d'un mouvement (filtre « Mouvement ») : les sorties regroupent perte, casse, usage interne. */
export type StockMovementGroup = 'in' | 'out' | 'reservation' | 'release' | 'adjustment';

export interface StockMovement {
  id: string;
  variant: string;
  variant_name: string;
  product_id: string;
  product_name: string;
  unit: ProductUnit;
  movement_type: StockMovementType;
  movement_type_display: string;
  type_group: StockMovementGroup;
  quantity: string;
  /** Quantité avec son signe : positive pour une entrée, négative pour une sortie. */
  signed_quantity: string;
  reason: string;
  order_id: string | null;
  order_number: string | null;
  order_status: string | null;
  unit_purchase_price: string | null;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string | null;
  created_by: string | null;
  created_by_email: string | null;
  author_name: string | null;
  created_at: string;
}

/** Paramètres d'URL d'une liste du stock (valeurs vides omises, page 1 implicite). */
function listParams(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && value === 1) continue;
    params.set(key === 'pageSize' ? 'page_size' : key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Historique paginé (onglet Mouvements desktop, fiche article). */
export function useStockMovements(filters: StockMovementsFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.stock.movements(filters),
    queryFn: () => apiFetch<PaginatedResponse<StockMovement>>(`/stock/movements/${listParams(filters)}`),
    enabled: options?.enabled,
  });
}

/** Carte « Derniers mouvements » de la fiche article, tous formats : 5, puis « Voir plus ». */
export function useProductMovements(productId: string) {
  return useShowMoreQuery<StockMovement>(qk.stock.productMovements(productId), '/stock/movements/', { product: productId }, !!productId);
}

/** Historique mobile : pages chargées à la suite (« Charger plus »). */
export function useStockMovementsInfinite(filters: Omit<StockMovementsFilters, 'page'>, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: qk.stock.movementsInfinite(filters),
    queryFn: ({ pageParam = 1 }) =>
      apiFetch<PaginatedResponse<StockMovement>>(`/stock/movements/${listParams({ ...filters, page: pageParam })}`),
    initialPageParam: 1 as number,
    getNextPageParam: (last, _, lastPageParam) => (last.next ? (lastPageParam as number) + 1 : undefined),
    enabled: options?.enabled,
  });
}

// ── Niveaux ─────────────────────────────────────────────────────────────────

/** Un format suivi : article actif, stock dérivé des mouvements. */
export interface StockLevel {
  id: string;
  product_id: string;
  product_name: string;
  packaging_name: string;
  unit: ProductUnit;
  sku: string;
  barcode: string;
  stock_quantity: string;
  low_stock_threshold: string | null;
  purchase_price: string | null;
  state: StockState;
  /** Stock × prix d'achat ; `null` sans prix d'achat ou en négatif. */
  purchase_value: string | null;
  last_movement_at: string | null;
}

/** Lecture directe (douchette : la saisie validée par Entrée n'attend pas le délai de recherche). */
export function fetchStockLevels(filters: StockLevelsFilters) {
  return apiFetch<PaginatedResponse<StockLevel>>(`/stock/levels/${listParams(filters)}`);
}

export function useStockLevels(filters: StockLevelsFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.stock.levels(filters),
    queryFn: () => fetchStockLevels(filters),
    enabled: options?.enabled,
  });
}

export function useStockLevelsInfinite(filters: Omit<StockLevelsFilters, 'page'>, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: qk.stock.levelsInfinite(filters),
    queryFn: ({ pageParam = 1 }) =>
      apiFetch<PaginatedResponse<StockLevel>>(`/stock/levels/${listParams({ ...filters, page: pageParam })}`),
    initialPageParam: 1 as number,
    getNextPageParam: (last, _, lastPageParam) => (last.next ? (lastPageParam as number) + 1 : undefined),
    enabled: options?.enabled,
  });
}

export interface StockLevelsFacets {
  state: Record<'all' | StockState, number>;
}

export function useStockLevelsFacets(filters: Omit<StockLevelsFilters, 'page' | 'ordering'>, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.stock.levelsFacets(filters),
    queryFn: () => apiFetch<StockLevelsFacets>(`/stock/levels/facets/${listParams(filters)}`),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

export interface StockLevelsSummary {
  formats: number;
  negative: number;
  out_of_stock: number;
  low_stock: number;
  purchase_value: string;
}

export function useStockLevelsSummary() {
  return useQuery({
    queryKey: qk.stock.levelsSummary,
    queryFn: () => apiFetch<StockLevelsSummary>('/stock/levels/summary/'),
  });
}

// ── Écritures ───────────────────────────────────────────────────────────────

export interface StockEntryPayload {
  lines: { variant: string; quantity: string; unit_purchase_price?: string | null; invoice_line_index?: number | null }[];
  supplier_name?: string;
  invoice_number?: string;
  invoice_date?: string | null;
  /** Facture lue (document envoyé) : l'entrée lui est rattachée. */
  ocr_document?: string | null;
}

export type StockExitReason = 'loss' | 'breakage' | 'internal_use';

export interface StockExitPayload {
  lines: { variant: string; quantity: string }[];
  reason: StockExitReason;
  note?: string;
}

export interface StockAdjustmentPayload {
  lines: { variant: string; counted_quantity: string }[];
  note?: string;
}

/** Une écriture de stock change niveaux, mouvements, articles, accueil et badges. */
function useInvalidateStock() {
  const qc = useQueryClient();
  return () => {
    for (const queryKey of [qk.stock.all, qk.products.all, qk.dashboard.all, qk.navBadges.all]) {
      qc.invalidateQueries({ queryKey });
    }
  };
}

export function useStockEntry() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (payload: StockEntryPayload) =>
      apiFetch<{ movements: StockMovement[] }>('/stock/entries/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });
}

export function useStockExit() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (payload: StockExitPayload) =>
      apiFetch<{ movements: StockMovement[] }>('/stock/exits/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });
}

/** Correction d'inventaire en une seule opération (tout ou rien) : un mouvement par écart non nul. */
export function useStockAdjustment() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (payload: StockAdjustmentPayload) =>
      apiFetch<{ movements: StockMovement[] }>('/stock/adjustments/', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });
}
