import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Ligne libellé / valeur d'une carte de détail, à placer dans un `<dl className="divide-y divide-border">`. */
export function DetailRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3 lg:px-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('text-end text-sm font-semibold tabular-nums', className)}>{children}</dd>
    </div>
  );
}
