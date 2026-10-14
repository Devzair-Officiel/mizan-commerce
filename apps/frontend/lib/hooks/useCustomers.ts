import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk, type CustomersListFilters } from '@/lib/query-keys';
import { useShowMoreQuery } from '@/lib/hooks/useShowMoreQuery';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CustomerSummary {
  id: string;
  name: string;
  first_name: string;
  /** Nom complet (« prénom nom ») : le seul à afficher. */
  display_name: string;
  phone: string;
  /** Le numéro, lisible (+33 6 12 34 56 78). `phone` (E.164) sert aux liens tel: et wa.me. */
  phone_display: string;
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

export const ACTIVITY_TYPES = ['order', 'payment', 'shipment', 'note'] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];
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

/** Activité du client (puces : un type, « À encaisser ») : 5 événements, puis « Voir plus ». */
export function useCustomerActivity(
  customerId: string,
  filter: ActivityFilter = null,
  pendingOnly: boolean = false,
) {
  return useShowMoreQuery<ActivityEvent>(
    qk.customers.activity(customerId, filter, pendingOnly),
    `/customers/${customerId}/activity/`,
    { types: filter ?? undefined, pending: pendingOnly ? 'true' : undefined },
    !!customerId,
  );
}


/** Période de l'export : jours inclus au fuseau de la boutique (AAAA-MM-JJ), bornes ouvertes si absentes. */
export interface ActivityExportRange {
  from?: string;
  to?: string;
}

export interface ActivityExportSummary {
  counts: Record<ActivityType, number>;
}

function exportParams(range: ActivityExportRange, pendingOnly: boolean, types?: readonly ActivityType[]): string {
  const search = new URLSearchParams();
  if (types) search.set('types', types.join(','));
  if (range.from) search.set('from', range.from);
  if (range.to) search.set('to', range.to);
  if (pendingOnly) search.set('pending', 'true');
  return search.toString();
}

/** Lignes de l'export par type pour la période, avant le téléchargement. */
export function useCustomerActivityExportSummary(
  customerId: string, range: ActivityExportRange, pendingOnly: boolean, enabled: boolean,
) {
  return useQuery({
    queryKey: qk.customers.activityExport(customerId, range, pendingOnly),
    queryFn: () => apiFetch<ActivityExportSummary>(
      `/customers/${customerId}/activity/export/summary/?${exportParams(range, pendingOnly)}`,
    ),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Fichier CSV, via le proxy : le cookie de session est relayé côté serveur, jamais lu ici.
 * `lang` : langue de l'interface (en-têtes, libellés, séparateur décimal du fichier).
 */
export function activityExportUrl(
  customerId: string, types: readonly ActivityType[], range: ActivityExportRange, pendingOnly: boolean, lang: string,
): string {
  return `/api/proxy/customers/${customerId}/activity/export/?${exportParams(range, pendingOnly, types)}&lang=${lang}`;
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
