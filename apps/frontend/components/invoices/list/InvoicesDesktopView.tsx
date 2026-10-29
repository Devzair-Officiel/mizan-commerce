'use client';

import { DataTable } from '@/components/list/DataTable';
import { DataTablePagination } from '@/components/list/DataTablePagination';
import { DataTableSkeleton } from '@/components/list/DataTableSkeleton';
import type { Invoice } from '@/lib/hooks/useInvoices';
import type { InvoicesPageState } from './useInvoicesPageState';
import { useInvoiceColumns } from './useInvoiceColumns';
import { invoiceHref } from '../shared/status';

export function InvoicesDesktopView({ invoices, loading, total, state }: {
  invoices: Invoice[]; loading: boolean; total: number; state: InvoicesPageState;
}) {
  const columns = useInvoiceColumns();
  if (loading) return <DataTableSkeleton />;
  if (!total) return null;
  return <DataTable columns={columns} rows={invoices} rowKey={i => i.id} rowHref={invoiceHref}
    isRowMuted={i => i.status === 'cancelled'} ordering={state.ordering} onSortChange={state.setOrdering}
    footer={<DataTablePagination page={state.page} pageSize={20} total={total} onPageChange={state.setPage} />} />;
}
