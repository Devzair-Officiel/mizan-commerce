import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

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
    queryKey: qk.customers.list(search, showInactive),
    queryFn: () => apiFetch<PaginatedResponse<CustomerSummary>>(`/customers/?${params}`),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: qk.customers.detail(id),
    queryFn: () => apiFetch<Customer>(`/customers/${id}/`),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerFormData) =>
      apiFetch<Customer>('/customers/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customers.all }),
  });
}

export function useDeactivateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/customers/${id}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.customers.all }),
  });
}

export function useReactivateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Customer>(`/customers/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk.customers.all });
      qc.invalidateQueries({ queryKey: qk.customers.detail(id) });
    },
  });
}

export type ActivityType = 'order' | 'payment' | 'shipment' | 'note';
export type ActivityFilter = ActivityType | null;

interface ActivityBase {
  id: string;
  occurred_at: string;
}

interface OrderEventData {
  order_id: string;
  order_number: string;
  total_amount: string;
  status: string;
  payment_status: string;
}

interface PaymentEventData {
  order_id: string;
  order_number: string;
  payment_status: string;
  amount_paid: string;
  total_amount: string;
}

interface ShipmentEventData {
  order_id: string;
  order_number: string;
}

interface NoteData {
  content: string;
  author_name: string | null;
  order_id: string | null;
}

export type ActivityEvent =
  | (ActivityBase & { type: 'order'; data: OrderEventData })
  | (ActivityBase & { type: 'payment'; data: PaymentEventData })
  | (ActivityBase & { type: 'shipment'; data: ShipmentEventData })
  | (ActivityBase & { type: 'note'; data: NoteData });

export function useCustomerActivityInfinite(
  customerId: string,
  filter: ActivityFilter = null,
  pendingOnly: boolean = false,
) {
  return useInfiniteQuery({
    queryKey: qk.customers.activity(customerId, filter, pendingOnly),
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (filter) params.set('types', filter);
      if (pendingOnly) params.set('pending', 'true');
      params.set('page', String(pageParam));
      params.set('page_size', '15');
      return apiFetch<PaginatedResponse<ActivityEvent>>(
        `/customers/${customerId}/activity/?${params}`,
      );
    },
    initialPageParam: 1,
    getNextPageParam: (last, _, lastPageParam) =>
      last.next ? (lastPageParam as number) + 1 : undefined,
    enabled: !!customerId,
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CustomerFormData>) =>
      apiFetch<Customer>(`/customers/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.customers.all });
      qc.invalidateQueries({ queryKey: qk.customers.detail(id) });
    },
  });
}
