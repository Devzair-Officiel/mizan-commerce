'use client';

import { DataTable } from '@/components/list/DataTable';
import { DataTablePagination } from '@/components/list/DataTablePagination';
import { OrdersTableSkeleton } from './OrdersTableSkeleton';
import { useOrderColumns } from './useOrderColumns';
import type { OrderSummary } from '@/lib/hooks/useOrders';

interface Props {
  orders: OrderSummary[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  currency: string;
  ordering: string;
  onSortChange: (ordering: string) => void;
  onPageChange: (page: number) => void;
}

export function OrdersDesktopView({
  orders, isLoading, total, page, pageSize, currency, ordering, onSortChange, onPageChange,
}: Props) {
  const columns = useOrderColumns(currency);
  if (isLoading) return <OrdersTableSkeleton />;
  if (total === 0) return null;
  return (
    <DataTable
      columns={columns}
      rows={orders}
      rowKey={(o) => o.id}
      rowHref={(o) => `/orders/${o.id}`}
      isRowMuted={(o) => o.status === 'cancelled'}
      ordering={ordering}
      onSortChange={onSortChange}
      footer={<DataTablePagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />}
    />
  );
}
