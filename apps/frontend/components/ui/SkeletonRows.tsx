import { cn } from '@/lib/utils';
import { LoadingRegion } from './LoadingRegion';
import { Skeleton } from './skeleton';

interface SkeletonRowsProps {
  count?: number;
  /** Marges des lignes, alignées sur celles de la liste chargée. */
  rowClassName?: string;
  /** Lignes séparées (`divide-y`, liste dans une carte) ou cartes séparées (`cards`). */
  variant?: 'divided' | 'cards';
}

/** Liste en cours de chargement : libellé, sous-ligne et valeur à droite sur chaque ligne. */
export function SkeletonRows({ count = 3, rowClassName = 'px-4 py-3 lg:px-5', variant = 'divided' }: SkeletonRowsProps) {
  const cards = variant === 'cards';
  return (
    <LoadingRegion className={cards ? 'flex flex-col gap-2' : 'divide-y divide-border'}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('flex items-center gap-3', rowClassName, cards && 'rounded-2xl border border-border bg-card')}>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </LoadingRegion>
  );
}
