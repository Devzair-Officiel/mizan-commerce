'use client';

import { useId } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FilterOption } from './FilterMenuButton';
import { FilterOptionLabel } from './FilterOptionLabel';

export interface ActiveFilter {
  /** Nom du filtre, pour la croix (« Retirer le filtre Statut »). */
  name: string;
  /** Option choisie, affichée avec sa pastille ou son badge. */
  option: FilterOption<string>;
  onRemove: () => void;
}

interface ListMobileToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  activeFilters: ActiveFilter[];
  onOpenFilters: () => void;
  /** Tri courant en toutes lettres (« Trié par date, plus récentes d'abord »). */
  sortLabel: string;
}

/** Barre d'outils d'une page de liste (mobile) : recherche, Filtres, filtres actifs, tri courant. */
export function ListMobileToolbar({
  searchValue, onSearchChange, searchLabel, searchPlaceholder, activeFilters, onOpenFilters, sortLabel,
}: ListMobileToolbarProps) {
  const t = useTranslations('ui.list');
  const inputId = useId();
  const count = activeFilters.length;
  return (
    <div className="flex flex-col gap-2.5">
      <div role="search" className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">{searchLabel}</label>
          <Search size={18} strokeWidth={1.75} aria-hidden
            className="pointer-events-none absolute inset-s-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input id={inputId} type="search" value={searchValue} onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full rounded-full border border-border bg-card ps-10.5 pe-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button type="button" onClick={onOpenFilters}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card ps-3.5 pe-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <SlidersHorizontal size={16} aria-hidden />
          {t('filters')}
          {count > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold tabular-nums text-primary-foreground">
              {count}<span className="sr-only"> {t('active_filters', { count })}</span>
            </span>
          )}
        </button>
      </div>
      {count > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {activeFilters.map((filter) => <ActiveFilterChip key={filter.name} filter={filter} />)}
        </ul>
      )}
      <p className="px-1 text-xs text-muted-foreground">{sortLabel}</p>
    </div>
  );
}

function ActiveFilterChip({ filter }: { filter: ActiveFilter }) {
  const t = useTranslations('ui.list');
  return (
    <li className="inline-flex h-9 items-center gap-0.5 rounded-full border border-secondary-foreground/15 bg-secondary/60 ps-1.5 pe-0.5 text-[0.8125rem] font-semibold text-foreground">
      <span className={filter.option.badgeClassName ? '' : 'ps-1.5'}><FilterOptionLabel option={filter.option} /></span>
      <button type="button" onClick={filter.onRemove} aria-label={t('remove_filter', { name: filter.name })}
        className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </li>
  );
}
