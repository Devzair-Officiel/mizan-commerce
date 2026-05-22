import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Product {
  id: string;
  name: string;
  reference: string;
  description: string;
  purchase_price: string;
  selling_price: string;
  stock_quantity: number;
  low_stock_threshold: number | null;
  is_active: boolean;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  primary_image: string | null;
  updated_at: string;
}

export interface ProductDetail extends Product {
  images: { id: string; object_key: string; is_primary: boolean; position: number }[];
  created_at: string;
}

export interface ProductFormData {
  name: string;
  reference?: string;
  description?: string;
  purchase_price: string;
  selling_price: string;
  low_stock_threshold?: number | null;
}

export function useProducts(search?: string, all?: boolean) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (all) params.set('all', '1');
  return useQuery({
    queryKey: ['products', search, all],
    queryFn: () => apiFetch<PaginatedResponse<Product>>(`/products/?${params}`),
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
