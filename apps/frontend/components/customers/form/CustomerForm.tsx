'use client';

import { useTranslations } from 'next-intl';
import { FormCard } from '@/components/form/FormCard';
import { FormField } from '@/components/form/FormField';
import { FormSaveBar } from '@/components/form/FormSaveBar';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import type { Customer, CustomerFormData } from '@/lib/hooks/useCustomers';
import { CustomerAddressSection } from './CustomerAddressSection';
import { useCustomerForm } from './useCustomerForm';

interface CustomerFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<Customer>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  isSubmitting: boolean;
  /** Retour sans enregistrer (après la garde « quitter sans enregistrer »). */
  onLeave: () => void;
}

/** Formulaire client au gabarit des formulaires : Identité, Contact, Adresse, Notes internes. */
export function CustomerForm({ mode, defaultValues, onSubmit, isSubmitting, onLeave }: CustomerFormProps) {
  const t = useTranslations('customers.form');
  const { form, submit, failed } = useCustomerForm(defaultValues, onSubmit);
  const { register, control, setValue, formState: { errors, isDirty } } = form;
  const cancel = useFormLeave(isDirty && !isSubmitting, onLeave);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <FormCard>
        <FormSection title={t('section_identity')} description={t('section_identity_help')}>
          <FormField label={t('first_name')} error={errors.first_name?.message}>
            {(c) => <input {...c} {...register('first_name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
          </FormField>
          <FormField label={t('name')} required error={errors.name?.message}>
            {(c) => <input {...c} {...register('name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
          </FormField>
        </FormSection>
        <FormSection title={t('section_contact')} description={t('section_contact_help')}>
          <FormField label={t('phone')} help={t('phone_help')} error={errors.phone?.message}>
            {(c) => <input {...c} {...register('phone')} type="tel" inputMode="tel" dir="ltr" autoComplete="off" className={`${FIELD_CONTROL} rtl:text-end`} />}
          </FormField>
          <FormField label={t('email')} error={errors.email?.message}>
            {(c) => <input {...c} {...register('email')} type="email" dir="ltr" autoComplete="off" className={`${FIELD_CONTROL} rtl:text-end`} />}
          </FormField>
        </FormSection>
        <CustomerAddressSection control={control} register={register} setValue={setValue} errors={errors} />
        <FormSection title={t('section_notes_internal')} description={t('section_notes_help')}>
          <FormField label={t('notes')} wide>
            {(c) => <textarea {...c} {...register('notes')} dir="auto" rows={4} className={FIELD_TEXTAREA} />}
          </FormField>
        </FormSection>
      </FormCard>
      {failed && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{t('save_failed')}</p>}
      <FormSaveBar
        dirty={isDirty}
        submitting={isSubmitting}
        submitLabel={mode === 'edit' ? t('submit_edit') : t('submit_create')}
        submitDisabled={mode === 'edit' && !isDirty}
        onCancel={cancel}
      />
    </form>
  );
}
