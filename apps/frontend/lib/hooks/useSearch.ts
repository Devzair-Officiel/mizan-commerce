import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProductType } from '@/lib/hooks/useProducts';

export interface SearchProduct {
  id: string;
  name: string;
  reference: string;
  type: ProductType;
  variant_count: number;
  is_out_of_stock: boolean;
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
  total_amount: string;
  customer_name: string | null;
}

export interface SearchResults {
  products: SearchProduct[];
  customers: SearchCustomer[];
  orders: SearchOrder[];
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => apiFetch<SearchResults>(`/search/?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}
