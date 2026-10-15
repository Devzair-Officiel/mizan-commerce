'use client';

import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Scale } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { FormField } from '@/components/form/FormField';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_CONTROL, FIELD_ROW, FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import { InvoiceIdentifierField } from './InvoiceIdentifierField';
import type { InvoiceSettingsValues } from './schema';

export function InvoiceLegalSection({ form }: { form: UseFormReturn<InvoiceSettingsValues> }) {
  const t = useTranslations('invoice_settings');
  const regime = useWatch({ control: form.control, name: 'invoice_vat_regime' });
  const error = (name: keyof InvoiceSettingsValues) => form.formState.errors[name] ? t(name === 'siret' ? 'siret_invalid' : 'invalid_value') : undefined;
  return (
    <FormSection icon={Scale} title={t('legal')} description={t('legal_help')} order="max-lg:order-2">
      <FormField label={t('legal_address')} error={error('legal_address')}>
        {(c) => <textarea {...c} {...form.register('legal_address')} dir="auto" rows={2} className={FIELD_TEXTAREA} />}
      </FormField>
      <div className={FIELD_ROW}>
        <InvoiceIdentifierField form={form} name="siret" label={t('siret')} error={error('siret')} />
        <FormField label={t('vat_regime')} help={regime === 'exempt' ? t('exempt_help') : undefined}>
          {(c) => <Controller name="invoice_vat_regime" control={form.control} render={({ field }) => (
            <FormSelect control={c} value={field.value} onChange={field.onChange} triggerRef={field.ref}
              options={[{ value: 'exempt', label: t('exempt') }, { value: 'applicable', label: t('applicable') }]} />
          )} />}
        </FormField>
      </div>
      {regime === 'applicable' && <div className={FIELD_ROW}>
        <InvoiceIdentifierField form={form} name="vat_number" label={t('vat_number')} required error={error('vat_number')} />
        <FormField label={t('tax_rate')} error={error('default_tax_rate')}>
          {(c) => <input {...c} {...form.register('default_tax_rate')} inputMode="decimal" type="number" min="0" max="100" step="0.01" className={FIELD_CONTROL} />}
        </FormField>
      </div>}
      <FormField label={t('tax_id')} error={error('tax_id')}>
        {(c) => <input {...c} {...form.register('tax_id')} dir="auto" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('legal_mentions')} error={error('legal_mentions')}>
        {(c) => <textarea {...c} {...form.register('legal_mentions')} dir="auto" rows={3} className={FIELD_TEXTAREA} />}
      </FormField>
    </FormSection>
  );
}
