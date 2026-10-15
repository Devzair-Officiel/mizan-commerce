'use client';

import { useWatch, type UseFormReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Receipt } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { FormField } from '@/components/form/FormField';
import { FormSelect } from '@/components/form/FormSelect';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { InvoiceIdentifierField } from './InvoiceIdentifierField';
import type { InvoiceSettingsValues } from './schema';

export function InvoicePaymentSection({ form }: { form: UseFormReturn<InvoiceSettingsValues> }) {
  const t = useTranslations('invoice_settings');
  const [days, methods] = useWatch({ control: form.control, name: ['default_payment_terms_days', 'invoice_payment_methods'] });
  const error = (name: keyof InvoiceSettingsValues) => form.formState.errors[name] ? t(name === 'invoice_iban' ? 'iban_invalid' : 'invalid_value') : undefined;
  return (
    <FormSection icon={Receipt} title={t('payment')} status="optional" order="max-lg:order-3">
      <div className={FIELD_ROW}>
        <FormField label={t('conditions')}>
          {(c) => <FormSelect control={c} value={days === 0 ? 'receipt' : 'days'}
            onChange={(value) => form.setValue('default_payment_terms_days', value === 'receipt' ? 0 : 30, { shouldDirty: true })}
            options={[{ value: 'receipt', label: t('receipt') }, { value: 'days', label: t('after_days') }]} />}
        </FormField>
        {days !== 0 && <FormField label={t('due_days')} error={error('default_payment_terms_days')}>
          {(c) => <input {...c} {...form.register('default_payment_terms_days', { valueAsNumber: true })} type="number" min="1" max="365" inputMode="numeric" className={FIELD_CONTROL} />}
        </FormField>}
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-3">
        <legend className="mb-2 text-[0.8125rem] font-medium">{t('methods')}</legend>
        {(['cash', 'card', 'transfer', 'cheque'] as const).map((method) => (
          <label key={method} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" value={method} {...form.register('invoice_payment_methods')} className="size-4 accent-primary" />{t(method)}
          </label>
        ))}
      </fieldset>
      {methods.includes('transfer') && <>
        <InvoiceIdentifierField form={form} name="invoice_iban" label={t('iban')} help={t('bank_help')} error={error('invoice_iban')} />
        <FormField label={t('bic')} error={error('invoice_bic')}>
          {(c) => <input {...c} {...form.register('invoice_bic')} dir="ltr" className={FIELD_CONTROL} />}
        </FormField>
      </>}
    </FormSection>
  );
}
