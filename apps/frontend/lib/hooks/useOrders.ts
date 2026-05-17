import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

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

export interface OrderItem {
  id: string;
  product: string;
  product_name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface Order extends OrderSummary {
  items: OrderItem[];
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  notes: string;
  stock_reserved: boolean;
  cancelled_at: string | null;
  updated_at: string;
}

export interface OrderCreateData {
  customer?: string | null;
  notes?: string;
  discount_amount?: string;
  shipping_amount?: string;
  items?: { product: string; quantity: number; unit_price?: string }[];
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
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

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => apiFetch<Order>(`/orders/${id}/`),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderCreateData) =>
      apiFetch<Order>('/orders/', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useTransitionOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) =>
      apiFetch<Order>(`/orders/${id}/transition/`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdatePayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amount_paid: string) =>
      apiFetch<Order>(`/orders/${id}/payment/`, { method: 'POST', body: JSON.stringify({ amount_paid }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
