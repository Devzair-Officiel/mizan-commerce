import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<T> {
  /** Identifiant de colonne, et champ de tri DRF quand `sortable`. */
  key: string;
  header: string;
  align?: 'start' | 'end';
  sortable?: boolean;
  /** Sens du premier clic : décroissant pour les dates et les montants. */
  firstDirection?: SortDirection;
  /** Cellule principale : son contenu devient le vrai lien de la ligne. */
  primary?: boolean;
  cell: (row: T) => ReactNode;
}

/** `-created_at` → { field: 'created_at', direction: 'desc' }. */
export function parseOrdering(ordering: string): { field: string; direction: SortDirection } {
  return ordering.startsWith('-')
    ? { field: ordering.slice(1), direction: 'desc' }
    : { field: ordering, direction: 'asc' };
}
