import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { Skeleton } from '@/components/ui/skeleton';

/** Chargement d'une page : titre et cartes en squelette, en attendant sa propre mise en forme. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Skeleton className="h-7 w-48" />
      <SectionsSkeleton sections={[2, 3]} />
    </div>
  );
}
