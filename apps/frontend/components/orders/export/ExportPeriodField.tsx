'use client';

import type { UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { SegmentedField } from './SegmentedField';
import { EXPORT_PERIODS, type OrdersExportValues } from './useOrdersExportForm';

interface ExportPeriodFieldProps {
  register: UseFormRegister<OrdersExportValues>;
  period: OrdersExportValues['period'];
  /** Date de fin avant la date de début (période personnalisée). */
  error?: string;
}

/**
 * « Date de création » des commandes (l'intitulé dit sur quelle date porte la période) : 2 × 2 sur
 * mobile, une ligne au-delà ; deux dates si « Personnalisée ».
 */
export function ExportPeriodField({ register, period, error }: ExportPeriodFieldProps) {
  const t = useTranslations('orders.export');
  const options = EXPORT_PERIODS.map((value) => ({ value, label: t('period', { period: value }) }));
  return (
    <SegmentedField label={t('period_label')} options={options} register={register('period')} columns="grid-cols-2 sm:grid-cols-4">
      {period === 'custom' && (
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          <FormField label={t('from')}>
            {(c) => <input {...c} {...register('from')} type="date" className={FIELD_CONTROL} />}
          </FormField>
          <FormField label={t('to')} error={error}>
            {(c) => <input {...c} {...register('to')} type="date" className={FIELD_CONTROL} />}
          </FormField>
        </div>
      )}
    </SegmentedField>
  );
}
