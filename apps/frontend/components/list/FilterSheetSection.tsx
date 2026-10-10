'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { FilterOption } from './FilterMenuButton';
import { FilterOptionContent } from './FilterOptionContent';

interface FilterSheetSectionProps<T extends string> {
  title: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}

/**
 * Section à choix unique de la fenêtre Filtres (mobile), même déclaration que
 * `FilterMenuButton` : boutons radio natifs (flèches au clavier), lignes de
 * 48px, rendu des options identique au menu desktop.
 */
export function FilterSheetSection<T extends string>({ title, value, options, onChange }: FilterSheetSectionProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label key={option.value} className={cn(
            'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl ps-3 pe-3.5 text-sm text-foreground transition-colors active:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring',
            selected && 'font-semibold',
          )}>
            <input type="radio" name={name} value={option.value} checked={selected}
              onChange={() => onChange(option.value)} className="sr-only" />
            <FilterOptionContent option={option} selected={selected} />
          </label>
        );
      })}
    </fieldset>
  );
}
