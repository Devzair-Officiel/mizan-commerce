'use client';

import { TopBar } from '@/components/layout/TopBar';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Skeleton } from '@/components/ui/skeleton';
import { DETAIL_COLUMN, DETAIL_GRID } from './DetailSlot';

/** Carte en cours de chargement : titre, puis `rows` lignes libellé / valeur. */
function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><Skeleton className="h-4 w-1/3" /></div>
      <div className="flex flex-col gap-3 px-5 py-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface DetailPageSkeletonProps {
  /** Titre de la barre mobile, affiché tant que l'objet n'est pas chargé. */
  title: string;
  /** Nombre de lignes de chaque carte, colonne de gauche puis colonne de droite. */
  left: number[];
  right: number[];
}

/** Page de détail en cours de chargement, à la forme du gabarit : en-tête, objet à gauche, colonne fixe à droite. */
export function DetailPageSkeleton({ title, left, right }: DetailPageSkeletonProps) {
  return (
    <>
      <div className="contents lg:hidden"><TopBar title={title} back hideSearch /></div>
      <LoadingRegion>
        <div className="hidden flex-col gap-2.5 px-4 pt-2 lg:flex">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="flex flex-col gap-4 p-4 lg:pt-5 lg:pb-8">
          <Skeleton className="h-6 w-24 rounded-full lg:hidden" />
          <div className={DETAIL_GRID}>
            <div className={DETAIL_COLUMN}>{left.map((rows, i) => <CardSkeleton key={i} rows={rows} />)}</div>
            <div className={DETAIL_COLUMN}>{right.map((rows, i) => <CardSkeleton key={i} rows={rows} />)}</div>
          </div>
        </div>
      </LoadingRegion>
    </>
  );
}
