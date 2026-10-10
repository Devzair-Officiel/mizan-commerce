'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DataTableHeaderCell } from './DataTableHeaderCell';
import { parseOrdering, type DataTableColumn } from './dataTableTypes';

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref: (row: T) => string;
  /** Lignes atténuées (commande annulée, article archivé…). */
  isRowMuted?: (row: T) => boolean;
  ordering: string;
  onSortChange: (ordering: string) => void;
  /** Pied de tableau, en général `DataTablePagination`. */
  footer?: ReactNode;
}

/** Tableau d'une page de liste : en-têtes triables, ligne entière cliquable. */
export function DataTable<T>({ columns, rows, rowKey, rowHref, isRowMuted, ordering, onSortChange, footer }: DataTableProps<T>) {
  const router = useRouter();
  const sort = parseOrdering(ordering);

  // La ligne entière navigue ; le vrai lien de la cellule principale garde
  // clavier, clic droit et ctrl+clic. On ignore un clic qui sélectionne du texte.
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, href: string) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey) window.open(href, '_blank', 'noopener');
    else router.push(href);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-205 border-collapse">
          <thead className="bg-muted">
            <tr className="border-b border-border">
              {columns.map((column) => (
                <DataTableHeaderCell key={column.key} column={column} onSort={onSortChange}
                  direction={sort.field === column.key ? sort.direction : null} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref(row);
              return (
                <tr key={rowKey(row)} onClick={(e) => onRowClick(e, href)}
                  className={cn('cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-muted/50',
                    isRowMuted?.(row) && 'text-muted-foreground')}>
                  {columns.map((column) => (
                    <td key={column.key} className={cn('px-5 py-3.5 align-middle', column.align === 'end' && 'text-end')}>
                      {column.primary
                        ? <Link href={href} className="block focus-visible:underline focus-visible:outline-none">{column.cell(row)}</Link>
                        : column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </section>
  );
}
