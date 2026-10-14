'use client';

import { useId } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { EXPORT_PERIODS, type ActivityExportValues } from './useActivityExportForm';

interface ExportPeriodFieldProps {
  register: UseFormRegister<ActivityExportValues>;
  period: ActivityExportValues['period'];
  /** Date de fin avant la date de début (période personnalisée). */
  error?: string;
}

/** « Période » : contrôle segmenté (radios natifs), puis deux dates si « Personnalisée ». */
export function ExportPeriodField({ register, period, error }: ExportPeriodFieldProps) {
  const t = useTranslations('customers.export');
  const labelId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id={labelId} className="text-[0.8125rem] font-semibold text-foreground">{t('period_label')}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-1 rounded-[0.875rem] bg-muted p-1">
        {EXPORT_PERIODS.map((value) => (
          <label key={value}
            className="flex min-h-9 cursor-pointer items-center justify-center rounded-[0.625rem] px-1.5 py-1 text-center text-[0.8125rem] leading-tight font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-card has-checked:font-semibold has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-primary/30">
            <input type="radio" value={value} {...register('period')} className="sr-only" />
            {t('period', { period: value })}
          </label>
        ))}
      </div>
      {period === 'custom' && (
        <div className={`${FIELD_ROW} mt-1.5`}>
          <FormField label={t('from')}>
            {(c) => <input {...c} {...register('from')} type="date" className={FIELD_CONTROL} />}
          </FormField>
          <FormField label={t('to')} error={error}>
            {(c) => <input {...c} {...register('to')} type="date" className={FIELD_CONTROL} />}
          </FormField>
        </div>
      )}
    </div>
  );
}
