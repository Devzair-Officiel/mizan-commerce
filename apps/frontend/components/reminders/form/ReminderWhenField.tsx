'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { useFormatShopDate } from '@/lib/hooks/useFormat';
import { useShopTimeZone } from '@/lib/hooks/useShop';
import { cn } from '@/lib/utils';
import { inOneWeekAt, nextMondayAt, toDateInput, toTimeInput, todayAt, tomorrowAt } from '../reminderDates';
import type { ReminderFormValues } from './useReminderForm';

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** Raccourcis de « Quand », à l'heure de la boutique : le libellé reçoit l'heure formatée dans la langue de l'interface. */
const SHORTCUTS = [
  { key: 'today', date: (tz: string) => todayAt(18, tz) },
  { key: 'tomorrow', date: (tz: string) => tomorrowAt(9, tz) },
  { key: 'monday', date: (tz: string) => nextMondayAt(9, tz) },
  { key: 'week', date: (tz: string) => inOneWeekAt(9, tz) },
] as const;

interface ReminderWhenFieldProps {
  control: Control<ReminderFormValues>;
  register: UseFormRegister<ReminderFormValues>;
  setValue: UseFormSetValue<ReminderFormValues>;
  errors: FieldErrors<ReminderFormValues>;
}

/**
 * « Quand » : raccourcis (aujourd'hui 18 h, demain 9 h, lundi 9 h, dans une semaine), puis date et
 * heure. L'astérisque est sur « Quand » ; date et heure restent annoncées comme obligatoires.
 */
export function ReminderWhenField({ control, register, setValue, errors }: ReminderWhenFieldProps) {
  const t = useTranslations('reminders.form');
  const formatDate = useFormatShopDate();
  const tz = useShopTimeZone();
  const [date, time] = useWatch({ control, name: ['date', 'time'] });

  function pick(d: Date) {
    setValue('date', toDateInput(d, tz), { shouldDirty: true, shouldValidate: true });
    setValue('time', toTimeInput(d, tz), { shouldDirty: true, shouldValidate: true });
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-[0.8125rem] font-medium text-foreground">
        {t('when')}
        <span className="ms-0.5 text-red-700 dark:text-red-400" aria-hidden>*</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map(({ key, date: at }) => {
          const d = at(tz);
          const active = toDateInput(d, tz) === date && toTimeInput(d, tz) === time;
          return (
            <button key={key} type="button" aria-pressed={active} onClick={() => pick(d)}
              className={cn(
                'h-8.5 rounded-full border px-3 text-[0.8125rem] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/30',
                active ? 'border-primary bg-secondary font-semibold text-secondary-foreground' : 'border-border bg-card font-medium text-foreground hover:bg-muted',
              )}>
              {t('shortcut', { key, time: formatDate(d, TIME) })}
            </button>
          );
        })}
      </div>
      <div className={FIELD_ROW}>
        <FormField label={t('date')} error={errors.date?.message}>
          {(c) => <input {...c} aria-required {...register('date')} type="date" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('time')} error={errors.time?.message}>
          {(c) => <input {...c} aria-required {...register('time')} type="time" className={FIELD_CONTROL} />}
        </FormField>
      </div>
    </fieldset>
  );
}
