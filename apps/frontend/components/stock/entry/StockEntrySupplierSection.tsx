'use client';

import { useWatch } from 'react-hook-form';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { useFormat } from '@/lib/hooks/useFormat';
import type { StockEntryForm } from './useStockEntryForm';
import { isolateNumber } from '@/components/orders/OrderNumber';

interface StockEntrySupplierSectionProps {
  form: StockEntryForm;
  open: boolean;
  onToggle: () => void;
}

/** « Fournisseur et facture » (facultatif) ; repliée, la section résume « Lin & Co, facture F-2026-118, 8 oct. 2026 ». */
export function StockEntrySupplierSection({ form, open, onToggle }: StockEntrySupplierSectionProps) {
  const t = useTranslations('stock.entry');
  const f = useFormat();
  const { register, formState: { errors } } = form;
  const [supplier, number, date] = useWatch({ control: form.control, name: ['supplier_name', 'invoice_number', 'invoice_date'] });
  const summary = [
    supplier.trim(),
    number.trim() ? t('summary_invoice', { number: isolateNumber(number.trim()) }) : '',
    date ? f.date(date, { day: 'numeric', month: 'short', year: 'numeric' }) : '',
  ].filter(Boolean).join(', ');

  return (
    <FormCollapsibleSection title={t('supplier_title')} description={t('supplier_help')} summary={summary}
      icon={<FileText size={19} strokeWidth={1.75} />} open={open} onToggle={onToggle}>
      <FormField label={t('supplier_name')} error={errors.supplier_name?.message}>
        {(c) => <input {...c} {...register('supplier_name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('invoice_number')} error={errors.invoice_number?.message}>
        {(c) => <input {...c} {...register('invoice_number')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('invoice_date')} error={errors.invoice_date?.message}>
        {(c) => <input {...c} {...register('invoice_date')} type="date" className={FIELD_CONTROL} />}
      </FormField>
    </FormCollapsibleSection>
  );
}
