'use client';

import { DataTable } from '@/components/list/DataTable';
import { DataTablePagination } from '@/components/list/DataTablePagination';
import { DataTableSkeleton } from '@/components/list/DataTableSkeleton';
import { QUOTES_PAGE_SIZE, type Quote } from '@/lib/hooks/useQuotes';
import { quoteHref } from './status';
import { useQuoteColumns } from './useQuoteColumns';

const noSort = () => {};

export function QuotesDesktopView({ quotes, loading, total, page, onPageChange }: {
  quotes: Quote[]; loading: boolean; total: number; page: number; onPageChange: (page: number) => void;
}) {
  const columns = useQuoteColumns();
  if (loading) return <DataTableSkeleton />;
  if (!total) return null;
  return <DataTable columns={columns} rows={quotes} rowKey={q => q.id} rowHref={quoteHref} ordering="" onSortChange={noSort}
    footer={<DataTablePagination page={page} pageSize={QUOTES_PAGE_SIZE} total={total} onPageChange={onPageChange} />} />;
}
