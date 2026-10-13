'use client';

import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { useUpdateReminderSettings, type ReminderSettings } from '@/lib/hooks/useReminders';
import { notify } from '@/lib/notify';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h));

/** « Régler les délais » : jours avant la relance et les commandes en attente, heure du résumé. */
export function ReminderDelaysDialog({ settings, onClose }: { settings: ReminderSettings; onClose: () => void }) {
  const t = useTranslations('reminders.auto');
  const formId = useId();
  const formatDate = useFormatDate();
  const update = useUpdateReminderSettings();
  const days = z.string().trim().regex(/^\d+$/, t('days_invalid'))
    .refine((v) => Number(v) >= 1 && Number(v) <= 60, t('days_invalid'));
  const schema = z.object({ unpaid_followup_days: days, pending_orders_days: days, daily_summary_hour: z.string() });
  const { register, control, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      unpaid_followup_days: String(settings.unpaid_followup_days),
      pending_orders_days: String(settings.pending_orders_days),
      daily_summary_hour: String(settings.daily_summary_hour),
    },
  });
  const hours = HOURS.map((h) => ({ value: h, label: formatDate(new Date(2000, 0, 1, Number(h)), { hour: '2-digit', minute: '2-digit' }) }));
  const submit = handleSubmit((values) => update.mutate({
    unpaid_followup_days: Number(values.unpaid_followup_days),
    pending_orders_days: Number(values.pending_orders_days),
    daily_summary_hour: Number(values.daily_summary_hour),
  }, {
    onSuccess: () => { notify.success(t('saved')); onClose(); },
    onError: () => notify.error(t('save_failed')),
  }));

  return (
    <BottomSheet open onClose={onClose} title={t('delays_title')} description={t('delays_description')} footer={
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-full px-4">{t('cancel')}</Button>
        <Button type="submit" form={formId} disabled={update.isPending} className="h-11 flex-1 rounded-full px-5 font-semibold lg:flex-none">
          {t('save')}
        </Button>
      </div>
    }>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormField label={t('unpaid_days_label')} help={t('days_help')} error={errors.unpaid_followup_days?.message}>
          {(c) => <input {...c} {...register('unpaid_followup_days')} inputMode="numeric" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('pending_days_label')} help={t('days_help')} error={errors.pending_orders_days?.message}>
          {(c) => <input {...c} {...register('pending_orders_days')} inputMode="numeric" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('summary_hour_label')}>
          {(c) => (
            <Controller control={control} name="daily_summary_hour" render={({ field }) => (
              <FormSelect control={c} value={field.value} onChange={field.onChange} options={hours} triggerRef={field.ref} />
            )} />
          )}
        </FormField>
      </form>
    </BottomSheet>
  );
}
