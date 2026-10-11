import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProductUnit } from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';

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

export interface StockMovementsOptions {
  productId?: string;
  variantId?: string;
  pageSize?: number;
}

export function useStockMovements(options: StockMovementsOptions = {}) {
  const { productId, variantId, pageSize } = options;
  const params = new URLSearchParams();
  if (productId) params.set('product', productId);
  if (variantId) params.set('variant', variantId);
  if (pageSize) params.set('page_size', String(pageSize));
  const qs = params.toString();
  return useQuery({
    queryKey: qk.stock.movements({ productId, variantId, pageSize }),
    queryFn: () =>
      apiFetch<PaginatedResponse<StockMovement>>(`/stock/movements/${qs ? `?${qs}` : ''}`),
  });
}
