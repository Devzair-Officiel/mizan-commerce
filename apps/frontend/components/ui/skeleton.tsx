import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Bloc de squelette (shadcn/ui) : forme du contenu à venir, `bg-muted animate-pulse`. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
