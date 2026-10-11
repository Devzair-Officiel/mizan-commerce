import { cn } from '@/lib/utils';
import { LoadingRegion } from './LoadingRegion';
import { Skeleton } from './skeleton';

interface SectionsSkeletonProps {
  /** Nombre de champs (ou blocs) de chaque carte, dans l'ordre de la page. */
  sections: number[];
  className?: string;
}

/** Page de formulaire ou de réglages en cours de chargement : une carte par section, titre puis champs. */
export function SectionsSkeleton({ sections, className }: SectionsSkeletonProps) {
  return (
    <LoadingRegion className={cn('flex flex-col gap-4', className)}>
      {sections.map((fields, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-1/3" />
          {Array.from({ length: fields }).map((_, j) => <Skeleton key={j} className="h-12 rounded-xl" />)}
        </div>
      ))}
    </LoadingRegion>
  );
}
