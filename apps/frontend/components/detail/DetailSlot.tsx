import type { ReactNode } from 'react';

/** Grille des pages de détail : une pile sous lg, l'objet à gauche et une colonne fixe à droite. */
export const DETAIL_GRID =
  'flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_25rem]';

/** Colonne de la grille : transparente sous lg (les cartes se réordonnent dans la pile). */
export const DETAIL_COLUMN = 'contents lg:flex lg:flex-col lg:gap-5';

/** Emplacement d'une carte : position dans la pile mobile, masqué si la carte ne rend rien. */
export function DetailSlot({ order, children }: { order: string; children: ReactNode }) {
  return <div className={`${order} empty:hidden`}>{children}</div>;
}
