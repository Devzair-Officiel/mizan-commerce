'use client';

import { DataTable } from '@/components/list/DataTable';
import { DataTablePagination } from '@/components/list/DataTablePagination';
import { DataTableSkeleton } from '@/components/list/DataTableSkeleton';
import type { CatalogKind } from '@/lib/hooks/useMe';
import type { Product } from '@/lib/hooks/useProducts';
import { useProductColumns } from './useProductColumns';

interface Props {
  kind: CatalogKind;
  products: Product[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  currency: string;
  ordering: string;
  onSortChange: (ordering: string) => void;
  onPageChange: (page: number) => void;
}

export function ProductsDesktopView({
  kind, products, isLoading, total, page, pageSize, currency, ordering, onSortChange, onPageChange,
}: Props) {
  const columns = useProductColumns(kind, currency);
  if (isLoading) return <DataTableSkeleton />;
  if (total === 0) return null;
  return (
    <DataTable
      columns={columns}
      rows={products}
      rowKey={(p) => p.id}
      rowHref={(p) => `/products/${p.id}`}
      isRowMuted={(p) => !p.is_active}
      ordering={ordering}
      onSortChange={onSortChange}
      footer={<DataTablePagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />}
    />
  );
}
