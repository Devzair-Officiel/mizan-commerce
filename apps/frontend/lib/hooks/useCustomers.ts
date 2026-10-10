import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk, type CustomersListFilters } from '@/lib/query-keys';

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
  /** Commandes annulées exclues des quatre chiffres suivants. */
  order_count: number;
  pending_amount: string;
  paid_amount: string;
  last_order_at: string | null;
}

export interface Customer extends CustomerSummary {
  first_name: string;
  address_line: string;
  postal_code: string;
  country: string;
  notes: string;
  updated_at: string;
}

/** Indicateurs de la page Clients. */
export interface CustomersSummary {
  active: { count: number };
  due: { count: number; amount: string };
  new_this_month: { count: number };
}

/** Nombre de clients par situation (mêmes filtres que la liste). */
export interface CustomersFacets {
  situation: Record<'all' | 'active' | 'pending' | 'deactivated', number>;
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

function listParams(filters: CustomersListFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ['situation', 'period', 'search', 'ordering'] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.page_size) params.set('page_size', String(filters.page_size));
  return params;
}

/** Clients actifs correspondant à la recherche (sélecteur de client de la commande). */
export function useCustomers(search?: string) {
  return useCustomersList({ search: search || undefined });
}

export function useCustomersList(filters: CustomersListFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.customers.list(filters),
    queryFn: () => apiFetch<PaginatedResponse<CustomerSummary>>(`/customers/?${listParams(filters)}`),
    enabled: options?.enabled,
  });
}

export function useCustomersInfinite(filters: Omit<CustomersListFilters, 'page'>, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: qk.customers.listInfinite(filters),
    queryFn: ({ pageParam = 1 }) =>
      apiFetch<PaginatedResponse<CustomerSummary>>(`/customers/?${listParams({ ...filters, page: pageParam as number })}`),
    initialPageParam: 1 as number,
    getNextPageParam: (last, _, lastPageParam) =>
      last.next ? (lastPageParam as number) + 1 : undefined,
    enabled: options?.enabled,
  });
}

export function useCustomersSummary() {
  return useQuery({
    queryKey: qk.customers.summary,
    queryFn: () => apiFetch<CustomersSummary>('/customers/summary/'),
  });
}

export function useCustomersFacets(filters: Omit<CustomersListFilters, 'page'>, options?: { enabled?: boolean }) {
  // Le tri ne change pas les nombres : il reste hors de la clé de cache.
  const facetFilters = { ...filters, ordering: undefined };
  return useQuery({
    queryKey: qk.customers.facets(facetFilters),
    queryFn: () => apiFetch<CustomersFacets>(`/customers/facets/?${listParams(facetFilters)}`),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
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
