'use client';

import { DataTable } from '@/components/list/DataTable';
import { DataTablePagination } from '@/components/list/DataTablePagination';
import { DataTableSkeleton } from '@/components/list/DataTableSkeleton';
import type { StockLevel } from '@/lib/hooks/useStock';
import { useStockLevelColumns } from './useStockLevelColumns';
import type { StockLevelsPageState } from './useStockLevelsState';

interface Props {
  state: StockLevelsPageState;
  levels: StockLevel[];
  isLoading: boolean;
  total: number;
  pageSize: number;
  currency: string;
  onEntry: (level: StockLevel) => void;
}

export function StockLevelsDesktopView({ state, levels, isLoading, total, pageSize, currency, onEntry }: Props) {
  const columns = useStockLevelColumns(currency, onEntry);
  if (isLoading) return <DataTableSkeleton />;
  if (total === 0) return null;
  return (
    <DataTable
      columns={columns}
      rows={levels}
      rowKey={(l) => l.id}
      rowHref={(l) => `/products/${l.product_id}`}
      ordering={state.ordering}
      onSortChange={state.setOrdering}
      footer={<DataTablePagination page={state.page} pageSize={pageSize} total={total} onPageChange={state.setPage} />}
    />
  );
}
