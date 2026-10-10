'use client';

import { useId, type ReactNode } from 'react';
import { Search } from 'lucide-react';

interface ListToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** Boutons `FilterMenuButton`, dans l'ordre d'affichage. */
  filters?: ReactNode;
  /** Affiché uniquement quand au moins un filtre est actif. */
  clearLabel?: string;
  onClear?: () => void;
  /** Tri courant en toutes lettres (« Trié par date, plus récentes d'abord »). */
  sortLabel: string;
}

/** Barre d'outils d'une page de liste (desktop) : recherche, filtres, tri courant. */
export function ListToolbar({
  searchValue, onSearchChange, searchLabel, searchPlaceholder, filters, clearLabel, onClear, sortLabel,
}: ListToolbarProps) {
  const inputId = useId();
  return (
    <div role="search" className="flex flex-wrap items-center gap-2.5">
      <div className="relative w-84 min-w-60 shrink">
        <label htmlFor={inputId} className="sr-only">{searchLabel}</label>
        <Search size={18} strokeWidth={1.75} aria-hidden
          className="pointer-events-none absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-full border border-border bg-card ps-10.5 pe-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {filters}
      {onClear && clearLabel && (
        <button type="button" onClick={onClear}
          className="px-1 text-[0.8125rem] font-medium text-primary hover:underline">
          {clearLabel}
        </button>
      )}
      <span className="ms-auto text-[0.8125rem] text-muted-foreground">{sortLabel}</span>
    </div>
  );
}
