import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProductUnit } from '@/lib/hooks/useProducts';
import { qk } from '@/lib/query-keys';

export interface OrderToPrepare {
  id: string;
  order_number: string;
  total_amount: string;
  payment_status: string;
  created_at: string;
  customer_name: string | null;
  items_count: number;
  items_preview: { name: string; quantity: number }[];
}

export interface UnpaidOrder {
  id: string;
  order_number: string;
  total_amount: string;
  payment_status: string;
  created_at: string;
  customer_name: string | null;
  customer_id: string | null;
  customer_phone: string;
  amount_paid: string;
  amount_due: string;
}

export interface ProductSummary {
  id: string;
  variant_id: string;
  name: string;
  variant_name: string;
  unit: ProductUnit;
  base_quantity: string;
  stock_quantity: string;
  low_stock_threshold: string | null;
}

export interface ReminderSummary {
  id: string;
  title: string;
  category: string;
  due_at: string;
  customer_id: string | null;
  order_id: string | null;
  is_overdue: boolean;
}

interface DashboardBlock<T> {
  count: number;
  items: T[];
}

export interface RevenueDayPoint {
  date: string;
  revenue: string;
}

export interface DashboardData {
  today: {
    revenue: string;
    revenue_yesterday: string;
    orders_count: number;
  };
  revenue_last_7_days: RevenueDayPoint[];
  orders_to_prepare: DashboardBlock<OrderToPrepare> & { oldest_created_at: string | null };
  unpaid_orders: DashboardBlock<UnpaidOrder> & { total_due: string };
  low_stock_products: DashboardBlock<ProductSummary> & { out_of_stock_count: number };
  today_reminders: DashboardBlock<ReminderSummary>;
  setup: {
    has_orders: boolean;
    products_count: number;
    customers_count: number;
  };
}

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard.today,
    queryFn: () => apiFetch<DashboardData>('/dashboard/today/'),
  });
}
