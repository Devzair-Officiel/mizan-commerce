import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProductType } from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';

export interface SearchProduct {
  id: string;
  name: string;
  reference: string;
  type: ProductType;
  variant_count: number;
  is_out_of_stock: boolean;
  min_price: string | null;
}

export interface SearchCustomer {
  id: string;
  name: string;
  phone: string;
  city: string;
}

export interface SearchOrder {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: string;
  created_at: string;
  customer_name: string | null;
}

export interface SearchSection<T> {
  total: number;
  items: T[];
}

export interface SearchResults {
  products: SearchSection<SearchProduct>;
  customers: SearchSection<SearchCustomer>;
  orders: SearchSection<SearchOrder>;
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: qk.search.query(q),
    queryFn: () => apiFetch<SearchResults>(`/search/?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
