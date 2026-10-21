'use client';

import { useId, type ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

interface SegmentedFieldProps {
  label: string;
  options: readonly { value: string; label: ReactNode }[];
  register: UseFormRegisterReturn;
  /** Colonnes de la grille (« grid-cols-3 », « grid-cols-2 sm:grid-cols-4 »). */
  columns: string;
  /** Sous le contrôle : description de l'option choisie, note. */
  children?: ReactNode;
}

/** Contrôle segmenté (radios natifs, au clavier par les flèches), comme la période de l'export d'activité. */
export function SegmentedField({ label, options, register, columns, children }: SegmentedFieldProps) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id={labelId} className="text-[0.8125rem] font-semibold text-foreground">{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} className={`grid ${columns} gap-1 rounded-[0.875rem] bg-muted p-1`}>
        {options.map((option) => (
          <label key={option.value}
            className="flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[0.625rem] px-1.5 py-1 text-center text-[0.8125rem] leading-tight font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-card has-checked:font-semibold has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-primary/30">
            <input type="radio" value={option.value} {...register} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
      {children}
    </div>
  );
}
