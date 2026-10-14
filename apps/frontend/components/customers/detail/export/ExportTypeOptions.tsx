'use client';

import { useId } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { ACTIVITY_TYPES, type ActivityType } from '@/lib/hooks/useCustomers';
import type { ActivityExportValues } from './useActivityExportForm';

interface ExportTypeOptionsProps {
  register: UseFormRegister<ActivityExportValues>;
  /** Lignes de chaque type pour la période ; absentes pendant le premier chargement. */
  counts: Record<ActivityType, number> | undefined;
  error?: string;
}

/** « Contenu » : une case par type d'événement, avec son nombre de lignes. */
export function ExportTypeOptions({ register, counts, error }: ExportTypeOptionsProps) {
  const t = useTranslations('customers.export');
  const errorId = useId();

  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-[0.8125rem] font-semibold text-foreground">{t('content_label')}</legend>
      {ACTIVITY_TYPES.map((type) => (
        <label key={type}
          className="group flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 transition-colors hover:bg-muted/50 has-checked:border-primary has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary">
          <input type="checkbox" value={type} {...register('types')} className="sr-only" />
          <span aria-hidden
            className="flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-border bg-card text-primary-foreground group-has-checked:border-primary group-has-checked:bg-primary">
            <Check size={13} strokeWidth={3} className="opacity-0 group-has-checked:opacity-100" />
          </span>
          <span className="flex-1 text-sm font-medium text-foreground">{t('type', { type })}</span>
          {counts && <span className="text-[0.8125rem] tabular-nums text-muted-foreground">{counts[type]}</span>}
        </label>
      ))}
      {error && <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
    </fieldset>
  );
}
