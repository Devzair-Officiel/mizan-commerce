'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { ApiError } from '@/lib/api-client';
import { notify } from '@/lib/notify';
import { useShop } from '@/lib/hooks/useShop';
import { useUpdateInvoiceSettings, type InvoiceSettings } from '@/lib/hooks/useInvoiceSettings';
import { FormActions } from '@/components/form/FormActions';
import { resetKeepingEdits } from '@/components/form/resetKeepingEdits';
import { useFormLeave } from '@/components/form/useFormLeave';
import { FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import { invoiceFormValues, invoiceSettingsSchema, type InvoiceSettingsValues } from './schema';
import { InvoiceAppearanceSection } from './InvoiceAppearanceSection';
import { InvoiceLegalSection } from './InvoiceLegalSection';
import { InvoicePaymentSection } from './InvoicePaymentSection';
import { InvoiceOptionsSection } from './InvoiceOptionsSection';
import { InvoicePreview } from './InvoicePreview';

export function InvoiceSettingsForm({ settings, onLeave }: { settings: InvoiceSettings; onLeave: () => void }) {
  const t = useTranslations('invoice_settings');
  const { data: shop } = useShop();
  const update = useUpdateInvoiceSettings();
  const form = useForm<InvoiceSettingsValues>({ resolver: zodResolver(invoiceSettingsSchema), defaultValues: invoiceFormValues(settings) });
  const { isDirty, isSubmitting } = form.formState;
  const cancel = useFormLeave(isDirty && !isSubmitting, onLeave);
  useEffect(() => { resetKeepingEdits(form, invoiceFormValues(settings)); }, [form, settings]);

  async function save(values: InvoiceSettingsValues) {
    try {
      const saved = await update.mutateAsync(values);
      resetKeepingEdits(form, invoiceFormValues(saved), values);
      notify.success(t('saved'));
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === 'object') {
        const fields = 'errors' in error.data ? error.data.errors : error.data;
        if (fields && typeof fields === 'object') for (const field of Object.keys(values) as (keyof InvoiceSettingsValues)[]) {
          if (field in fields) form.setError(field, { message: t('invalid_value') }, { shouldFocus: true });
        }
      }
      notify.error(t('save_error'));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(save)} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <div className={FORM_COLUMNS}>
        <div className={FORM_COLUMN}>
          <InvoiceAppearanceSection form={form} settings={settings} shop={shop} />
          <InvoiceLegalSection form={form} />
          <InvoicePaymentSection form={form} />
          <InvoiceOptionsSection form={form} />
        </div>
        <div className={`${FORM_COLUMN} lg:sticky lg:top-6`}>
          <InvoicePreview control={form.control} settings={settings} />
        </div>
      </div>
      <FormActions dirty={isDirty} submitting={isSubmitting} submitLabel={t('save')} submitDisabled={!isDirty} onCancel={cancel} />
    </form>
  );
}
