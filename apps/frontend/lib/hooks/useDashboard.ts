import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProductUnit } from '@/lib/hooks/useProducts';

interface OrderSummary {
  id: string;
  order_number: string;
  total_amount: string;
  payment_status: string;
  created_at: string;
  customer_name: string | null;
}

interface ProductSummary {
  id: string;
  variant_id: string;
  name: string;
  variant_name: string;
  unit: ProductUnit;
  base_quantity: string;
  stock_quantity: string;
  low_stock_threshold: string | null;
}

interface ReminderSummary {
  id: string;
  title: string;
  category: string;
  due_at: string;
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
  orders_to_prepare: DashboardBlock<OrderSummary>;
  unpaid_orders: DashboardBlock<OrderSummary>;
  low_stock_products: DashboardBlock<ProductSummary>;
  today_reminders: DashboardBlock<ReminderSummary>;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => apiFetch<DashboardData>('/dashboard/today/'),
  });
}
