import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

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
  product: string | null;
  product_name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export type OrderItemPayload =
  | { product: string; quantity: number; unit_price?: string }
  | { product?: null; product_name: string; unit_price: string; quantity: number };

export interface Order extends OrderSummary {
  items: OrderItem[];
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
  status?: 'draft' | 'to_prepare' | 'prepared';
  payment_status?: 'unpaid' | 'partial' | 'paid';
  amount_paid?: string;
}

interface OrderFilters {
  status?: string;
  payment_status?: string;
  customer?: string;
}

export function useOrders(filters: OrderFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.payment_status) params.set('payment_status', filters.payment_status);
  if (filters.customer) params.set('customer', filters.customer);
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => apiFetch<PaginatedResponse<OrderSummary>>(`/orders/?${params}`),
  });
}

export function useCustomerOrdersInfinite(
  customerId: string,
  filters: { status?: string | null; payment_status?: string | null } = {},
) {
  return useInfiniteQuery({
    queryKey: ['orders', 'customer', customerId, filters],
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
    queryKey: ['orders', id],
    queryFn: () => apiFetch<Order>(`/orders/${id}/`),
    enabled: !!id,
  });
}

export function useOrderActivity(id: string) {
  return useQuery({
    queryKey: ['orders', id, 'activity'],
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
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (order?.customer) qc.invalidateQueries({ queryKey: ['customers', order.customer] });
    },
  });
}

export function useTransitionOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) =>
      apiFetch<Order>(`/orders/${id}/status/`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (order?.customer) qc.invalidateQueries({ queryKey: ['customers', order.customer] });
    },
  });
}

export function useUpdatePayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount_paid: string) =>
      apiFetch<Order>(`/orders/${id}/payment/`, { method: 'POST', body: JSON.stringify({ amount_paid }) }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (order?.customer) qc.invalidateQueries({ queryKey: ['customers', order.customer] });
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
      qc.invalidateQueries({ queryKey: ['orders'] });
      if (order?.customer) qc.invalidateQueries({ queryKey: ['customers', order.customer] });
    },
  });
}

export function useAddOrderItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderItemPayload) =>
      apiFetch<OrderItem>(`/orders/${id}/items/`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders', id] }),
  });
}

export function useUpdateOrderItem(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      apiFetch<OrderItem>(`/orders/${orderId}/items/${itemId}/`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders', orderId] }),
  });
}

export function useRemoveOrderItem(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<void>(`/orders/${orderId}/items/${itemId}/`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders', orderId] }),
  });
}
