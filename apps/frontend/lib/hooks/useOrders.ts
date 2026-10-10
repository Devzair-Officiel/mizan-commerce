import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk, type OrdersListFilters, type OrdersCustomerFilters } from '@/lib/query-keys';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  status_display: string;
  payment_status: string;
  payment_status_display: string;
  customer: string | null;
  customer_name: string | null;
  total_amount: string;
  amount_paid: string;
  item_count: number;
  items_preview: { name: string; quantity: number }[];
  created_at: string;
}

export interface OrderActivityEvent {
  id: string;
  type: 'created' | 'status_change' | 'payment_change' | 'note';
  occurred_at: string;
  actor_name: string | null;
  data: Record<string, string | null>;
}

export interface OrderItem {
  id: string;
  variant: string | null;
  product_id: string | null;
  product_name: string;
  variant_name: string;
  unit: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export type OrderItemPayload =
  | { variant: string; quantity: number; unit_price?: string }
  | { variant?: null; product_name: string; unit_price: string; quantity: number };

export interface OrderInvoiceSummary {
  id: string;
  number: string;
  status: 'issued' | 'paid' | 'cancelled';
}

export interface Order extends OrderSummary {
  items: OrderItem[];
  invoice: OrderInvoiceSummary | null;
  customer_phone: string | null;
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  stock_reserved: boolean;
  cancelled_at: string | null;
  updated_at: string;
}

export interface OrderCreateData {
  customer?: string | null;
  notes?: string;
  discount_amount?: string;
  shipping_amount?: string;
  items?: OrderItemPayload[];
  status?: 'to_prepare' | 'prepared' | 'shipped';
  payment_status?: 'unpaid' | 'partial' | 'paid';
  amount_paid?: string;
}

export interface OrdersSummary {
  to_prepare: { count: number; oldest_created_at: string | null };
  due: { count: number; amount: string };
  month: { revenue: string; shipped_count: number };
}

function listParams(filters: OrdersListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.payment_status) params.set('payment_status', filters.payment_status);
  if (filters.customer) params.set('customer', filters.customer);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.search) params.set('search', filters.search);
  if (filters.due) params.set('due', 'true');
  if (filters.period) params.set('period', filters.period);
  if (filters.ordering) params.set('ordering', filters.ordering);
  return params;
}

export function useOrders(filters: OrdersListFilters = {}, options?: { enabled?: boolean }) {
  const params = listParams(filters);
  return useQuery({
    queryKey: qk.orders.list(filters),
    queryFn: () => apiFetch<PaginatedResponse<OrderSummary>>(`/orders/?${params}`),
    enabled: options?.enabled,
  });
}

export function useOrdersInfinite(filters: Omit<OrdersListFilters, 'page'> = {}, options?: { enabled?: boolean }) {
  const buildParams = (pg: number) => listParams({ ...filters, page: pg });
  return useInfiniteQuery({
    queryKey: qk.orders.listInfinite(filters),
    queryFn: ({ pageParam = 1 }) =>
      apiFetch<PaginatedResponse<OrderSummary>>(`/orders/?${buildParams(pageParam as number)}`),
    initialPageParam: 1 as number,
    getNextPageParam: (last, _, lastPageParam) =>
      last.next ? (lastPageParam as number) + 1 : undefined,
    enabled: options?.enabled,
  });
}

export function useOrdersSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.orders.summary,
    queryFn: () => apiFetch<OrdersSummary>('/orders/summary/'),
    enabled: options?.enabled,
  });
}

export function useCustomerOrdersInfinite(
  customerId: string,
  filters: OrdersCustomerFilters = {},
) {
  return useInfiniteQuery({
    queryKey: qk.orders.byCustomer(customerId, filters),
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      params.set('customer', customerId);
      params.set('page', String(pageParam));
      params.set('page_size', '10');
      if (filters.status) params.set('status', filters.status);
      if (filters.payment_status) params.set('payment_status', filters.payment_status);
      return apiFetch<PaginatedResponse<OrderSummary>>(`/orders/?${params}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last, _, lastPageParam) =>
      last.next ? (lastPageParam as number) + 1 : undefined,
    enabled: !!customerId,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: qk.orders.detail(id),
    queryFn: () => apiFetch<Order>(`/orders/${id}/`),
    enabled: !!id,
  });
}

export function useOrderActivity(id: string) {
  return useQuery({
    queryKey: qk.orders.activity(id),
    queryFn: () => apiFetch<{ events: OrderActivityEvent[] }>(`/orders/${id}/activity/`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderCreateData) =>
      apiFetch<Order>('/orders/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: qk.orders.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.all });
      qc.invalidateQueries({ queryKey: qk.navBadges.all });
      if (order?.customer) qc.invalidateQueries({ queryKey: qk.customers.detail(order.customer) });
    },
  });
}

export function useTransitionOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) =>
      apiFetch<Order>(`/orders/${id}/status/`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: qk.orders.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.all });
      qc.invalidateQueries({ queryKey: qk.navBadges.all });
      qc.invalidateQueries({ queryKey: qk.invoices.all });
      if (order?.customer) qc.invalidateQueries({ queryKey: qk.customers.detail(order.customer) });
    },
  });
}

export function useUpdatePayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount_paid: string) =>
      apiFetch<Order>(`/orders/${id}/payment/`, { method: 'POST', body: JSON.stringify({ amount_paid }) }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: qk.orders.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.all });
      qc.invalidateQueries({ queryKey: qk.invoices.all });
      if (order?.customer) qc.invalidateQueries({ queryKey: qk.customers.detail(order.customer) });
    },
  });
}

export interface OrderUpdateData {
  customer?: string | null;
  discount_amount?: string;
  shipping_amount?: string;
}

export function useUpdateOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderUpdateData) =>
      apiFetch<Order>(`/orders/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: qk.orders.all });
      if (order?.customer) qc.invalidateQueries({ queryKey: qk.customers.detail(order.customer) });
    },
  });
}

export function useAddOrderItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderItemPayload) =>
      apiFetch<OrderItem>(`/orders/${id}/items/`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.orders.detail(id) }),
  });
}

export function useUpdateOrderItem(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      apiFetch<OrderItem>(`/orders/${orderId}/items/${itemId}/`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.orders.detail(orderId) }),
  });
}

export function useRemoveOrderItem(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<void>(`/orders/${orderId}/items/${itemId}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.orders.detail(orderId) }),
  });
}
