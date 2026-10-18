'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BasisView } from './basisCatalog';
import { useOpenBasis } from './BasisProvider';

interface BasisLinkProps {
  view: BasisView;
  label: string;
  /** Nom accessible quand le libellé visible est court (« Voir »). */
  ariaLabel?: string;
  icon?: boolean;
  className?: string;
}

/** Ouvre une fiche Fondement, ou la liste ; rien hors d'un `BasisProvider`. */
export function BasisLink({ view, label, ariaLabel, icon = true, className }: BasisLinkProps) {
  const open = useOpenBasis();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      onClick={() => open(view)}
      className={cn('inline-flex min-h-11 items-center gap-1.5 self-start text-start text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-primary/30', className)}
    >
      {icon && <Info className="size-4 shrink-0" aria-hidden />}
      {label}
    </button>
  );
}
