'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataTableColumn, SortDirection } from './dataTableTypes';

interface DataTableHeaderCellProps<T> {
  column: DataTableColumn<T>;
  /** Sens du tri si cette colonne est la colonne triée, sinon `null`. */
  direction: SortDirection | null;
  onSort: (ordering: string) => void;
}

const LABEL = 'flex w-full items-center gap-1.5 px-5 py-3 text-xs font-semibold whitespace-nowrap';
// Libellé d'en-tête : un peu plus contrasté que muted-foreground sur fond muted.
const LABEL_COLOR = 'text-[color-mix(in_srgb,var(--foreground)_72%,var(--muted))]';

export function DataTableHeaderCell<T>({ column, direction, onSort }: DataTableHeaderCellProps<T>) {
  const end = column.align === 'end';
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
  if (!column.sortable) {
    return (
      <th scope="col" className={cn('px-5 py-3 text-xs font-semibold whitespace-nowrap', LABEL_COLOR, end ? 'text-end' : 'text-start')}>
        {column.header}
      </th>
    );
  }
  const next = direction ? (direction === 'asc' ? 'desc' : 'asc') : (column.firstDirection ?? 'asc');
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <th scope="col" aria-sort={ariaSort} className="p-0">
      <button
        type="button"
        onClick={() => onSort(next === 'desc' ? `-${column.key}` : column.key)}
        className={cn(
          LABEL, end && 'justify-end',
          direction ? 'text-foreground' : LABEL_COLOR,
          'cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        )}
      >
        {column.header}
        <Icon size={14} aria-hidden className={direction ? undefined : 'opacity-60'} />
      </button>
    </th>
  );
}
