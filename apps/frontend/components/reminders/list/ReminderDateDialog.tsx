'use client';

import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import type { Reminder } from '@/lib/hooks/useReminders';
import { fromInputs, toDateInput, toTimeInput, tomorrowAt } from '../reminderDates';

interface ReminderDateDialogProps {
  reminder: Reminder;
  onClose: () => void;
  onSubmit: (date: Date) => void;
}

/** « Reporter » → « Choisir une date » : date et heure, demain 9 h proposé par défaut. */
export function ReminderDateDialog({ reminder, onClose, onSubmit }: ReminderDateDialogProps) {
  const t = useTranslations('reminders.list');
  const formId = useId();
  const schema = z.object({
    date: z.string().min(1, t('date_required')),
    time: z.string().min(1, t('time_required')),
  });
  const start = tomorrowAt(9);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { date: toDateInput(start), time: toTimeInput(start) },
  });
  const submit = handleSubmit(({ date, time }) => {
    const iso = fromInputs(date, time);
    if (!iso) return;
    onSubmit(new Date(iso));
    onClose();
  });

  return (
    <BottomSheet open onClose={onClose} title={t('pick_date_title')} description={reminder.title} footer={
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-4">{t('cancel')}</Button>
        <Button type="submit" form={formId} className="h-11 flex-1 rounded-full px-5 font-semibold lg:flex-none">
          {t('postpone_submit')}
        </Button>
      </div>
    }>
      <form id={formId} noValidate onSubmit={submit} className={FIELD_ROW}>
        <FormField label={t('date_label')} required error={errors.date?.message}>
          {(c) => <input {...c} {...register('date')} type="date" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('time_label')} required error={errors.time?.message}>
          {(c) => <input {...c} {...register('time')} type="time" className={FIELD_CONTROL} />}
        </FormField>
      </form>
    </BottomSheet>
  );
}
