'use client';

import type { UseFormRegister } from 'react-hook-form';
import { useLocale, useTranslations } from 'next-intl';
import { EXPORT_FORMATS, type OrdersExportFormat } from '@/lib/hooks/useOrderExports';
import { SegmentedField } from './SegmentedField';
import type { OrdersExportValues } from './useOrdersExportForm';

interface ExportFormatFieldProps {
  register: UseFormRegister<OrdersExportValues>;
  format: OrdersExportFormat;
}

/** « Format » : CSV, PDF ou WhatsApp, et une ligne qui décrit le format choisi. */
export function ExportFormatField({ register, format }: ExportFormatFieldProps) {
  const t = useTranslations('orders.export');
  const locale = useLocale();
  // Le PDF n'existe qu'en français et en anglais : l'arabe le reçoit en français, comme les factures.
  const frenchPdf = format === 'pdf' && locale === 'ar';
  const options = EXPORT_FORMATS.map((value) => ({ value, label: t('format', { format: value }) }));
  return (
    <SegmentedField label={t('format_label')} options={options} register={register('format')} columns="grid-cols-3">
      <p aria-live="polite" className="text-[0.8125rem] text-muted-foreground">
        {t('format_hint', { format })}
        {frenchPdf && <> <span className="font-medium text-foreground">{t('pdf_french')}</span></>}
      </p>
    </SegmentedField>
  );
}
