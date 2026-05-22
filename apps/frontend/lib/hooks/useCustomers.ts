import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CustomerSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  is_active: boolean;
  created_at: string;
  pending_amount: string;
}

export interface Customer extends CustomerSummary {
  first_name: string;
  address_line: string;
  postal_code: string;
  country: string;
  notes: string;
  order_count: number;
  pending_amount: string;
  paid_amount: string;
  updated_at: string;
}

export interface CustomerFormData {
  name: string;
  first_name?: string;
  phone?: string;
  email?: string;
  address_line?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  notes?: string;
}

export function useCustomers(search?: string, showInactive?: boolean) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (showInactive) params.set('all', '1');
  return useQuery({
    queryKey: ['customers', search, showInactive],
    queryFn: () => apiFetch<PaginatedResponse<CustomerSummary>>(`/customers/?${params}`),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => apiFetch<Customer>(`/customers/${id}/`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerFormData) =>
      apiFetch<Customer>('/customers/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeactivateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/customers/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useReactivateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Customer>(`/customers/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', id] });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CustomerFormData>) =>
      apiFetch<Customer>(`/customers/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customers', id] });
    },
  });
}
