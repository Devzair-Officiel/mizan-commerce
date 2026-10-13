'use client';

import { DataTable } from '@/components/list/DataTable';
import { DataTablePagination } from '@/components/list/DataTablePagination';
import { DataTableSkeleton } from '@/components/list/DataTableSkeleton';
import type { CustomerSummary } from '@/lib/hooks/useCustomers';
import { useCustomerColumns } from './useCustomerColumns';

interface Props {
  customers: CustomerSummary[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  currency: string;
  ordering: string;
  onSortChange: (ordering: string) => void;
  onPageChange: (page: number) => void;
}

export function CustomersDesktopView({
  customers, isLoading, total, page, pageSize, currency, ordering, onSortChange, onPageChange,
}: Props) {
  const columns = useCustomerColumns(currency);
  if (isLoading) return <DataTableSkeleton />;
  if (total === 0) return null;
  return (
    <DataTable
      columns={columns}
      rows={customers}
      rowKey={(c) => c.id}
      rowHref={(c) => `/customers/${c.id}`}
      isRowMuted={(c) => !c.is_active}
      ordering={ordering}
      onSortChange={onSortChange}
      footer={<DataTablePagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />}
    />
  );
}
