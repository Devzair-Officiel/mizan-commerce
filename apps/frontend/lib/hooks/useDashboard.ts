import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

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
  name: string;
  stock_quantity: number;
  low_stock_threshold: number | null;
  is_out_of_stock: boolean;
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

export interface DashboardData {
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
