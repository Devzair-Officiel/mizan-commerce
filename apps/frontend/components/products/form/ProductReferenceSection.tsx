'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Barcode } from 'lucide-react';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import type { ProductFormValues } from './useProductForm';

interface ProductReferenceSectionProps {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  open: boolean;
  onToggle: () => void;
}

/** Référence et code-barres (facultatifs) du format unique : recherche et lecture au scanner. */
export function ProductReferenceSection({ control, register, errors, open, onToggle }: ProductReferenceSectionProps) {
  const t = useTranslations('articles.form');
  const [sku, barcode] = useWatch({ control, name: ['sku', 'barcode'] });
  const summary = [sku.trim() && t('sku_summary', { sku: sku.trim() }), barcode.trim() && t('barcode_summary', { barcode: barcode.trim() })]
    .filter(Boolean).join(', ');

  return (
    <FormCollapsibleSection title={t('section_reference')} description={t('section_reference_help')} summary={summary}
      icon={<Barcode size={19} strokeWidth={1.75} />} open={open} onToggle={onToggle}>
      <FormField label={t('sku')} error={errors.sku?.message}>
        {(c) => <input {...c} {...register('sku')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('barcode')} error={errors.barcode?.message}>
        {(c) => <input {...c} {...register('barcode')} inputMode="numeric" autoComplete="off" className={`${FIELD_CONTROL} tabular-nums`} />}
      </FormField>
    </FormCollapsibleSection>
  );
}
