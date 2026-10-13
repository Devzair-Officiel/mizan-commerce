'use client';

import { useId } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import type { ReminderCategory, ReminderFormValues } from './useReminderForm';

interface ReminderCategoryFieldProps {
  register: UseFormRegister<ReminderFormValues>;
  /** Catégories proposées, dans l'ordre de la maquette. */
  options: readonly ReminderCategory[];
}

/** « Catégorie » : contrôle segmenté (boutons radio natifs, flèches du clavier comprises). */
export function ReminderCategoryField({ register, options }: ReminderCategoryFieldProps) {
  const t = useTranslations('reminders');
  const tForm = useTranslations('reminders.form');
  const labelId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={labelId} className="text-[0.8125rem] font-medium text-foreground">{tForm('category')}</span>
      <div role="radiogroup" aria-labelledby={labelId}
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
        {options.map((value) => (
          <label key={value}
            className="flex min-h-9 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-card has-checked:font-semibold has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-primary/30">
            <input type="radio" value={value} {...register('category')} className="sr-only" />
            {t('category', { value })}
          </label>
        ))}
      </div>
    </div>
  );
}
