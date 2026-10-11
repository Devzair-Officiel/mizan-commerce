'use client';

import { DataTable } from '@/components/list/DataTable';
import { DataTablePagination } from '@/components/list/DataTablePagination';
import { DataTableSkeleton } from '@/components/list/DataTableSkeleton';
import type { StockMovement } from '@/lib/hooks/useStock';
import { useStockMovementColumns } from './useStockMovementColumns';
import type { StockMovementsPageState } from './useStockMovementsState';

interface Props {
  state: StockMovementsPageState;
  movements: StockMovement[];
  isLoading: boolean;
  total: number;
  pageSize: number;
}

export function StockMovementsDesktopView({ state, movements, isLoading, total, pageSize }: Props) {
  const columns = useStockMovementColumns();
  if (isLoading) return <DataTableSkeleton />;
  if (total === 0) return null;
  return (
    <DataTable
      columns={columns}
      rows={movements}
      rowKey={(m) => m.id}
      rowHref={(m) => `/products/${m.product_id}`}
      ordering={state.ordering}
      onSortChange={state.setOrdering}
      footer={<DataTablePagination page={state.page} pageSize={pageSize} total={total} onPageChange={state.setPage} />}
    />
  );
}
