import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProductUnit } from '@/lib/hooks/useProducts';

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
  | 'loss';

export interface StockMovement {
  id: string;
  variant: string;
  variant_name: string;
  product_id: string;
  product_name: string;
  unit: ProductUnit;
  movement_type: StockMovementType;
  movement_type_display: string;
  quantity: string;
  reason: string;
  order_id: string | null;
  created_by: string | null;
  created_by_email: string | null;
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
    queryKey: ['stock', 'movements', { productId, variantId, pageSize }],
    queryFn: () =>
      apiFetch<PaginatedResponse<StockMovement>>(`/stock/movements/${qs ? `?${qs}` : ''}`),
  });
}
