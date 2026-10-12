'use client';

import { Controller, useWatch, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { ShoppingBag } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_READONLY } from '@/components/form/fieldStyles';
import { UNIT_NAMES, UNITS, type ProductFormValues } from './useProductForm';

interface ProductSaleSectionProps {
  control: Control<ProductFormValues>;
  mode: 'create' | 'edit';
  order: string;
}

/** Vente (article) : unité de vente, choisie à la création puis définitive. */
export function ProductSaleSection({ control, mode, order }: ProductSaleSectionProps) {
  const t = useTranslations('articles.form');
  const tUnits = useTranslations('articles.units');
  const unit = useWatch({ control, name: 'unit' });
  const options = UNITS.map((u) => ({ value: u, label: tUnits(UNIT_NAMES[u]) }));

  return (
    <FormSection icon={ShoppingBag} order={order} title={t('section_sale')}>
      <FormField label={t('unit')} required={mode === 'create'} help={t('unit_help')}>
        {(c) => mode === 'create'
          ? <Controller control={control} name="unit" render={({ field }) => (
              <FormSelect control={c} value={field.value} onChange={field.onChange} options={options} triggerRef={field.ref} />
            )} />
          : <output {...c} className={`${FIELD_READONLY} text-muted-foreground`}>{tUnits(UNIT_NAMES[unit])}</output>}
      </FormField>
    </FormSection>
  );
}
