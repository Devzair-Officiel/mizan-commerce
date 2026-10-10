'use client';

import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { NotebookPen } from 'lucide-react';
import { FormActions } from '@/components/form/FormActions';
import { FormCard } from '@/components/form/FormCard';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_TEXTAREA } from '@/components/form/fieldStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import type { Customer, CustomerFormData } from '@/lib/hooks/useCustomers';
import { CustomerAddressSection } from './CustomerAddressSection';
import { CustomerContactSection } from './CustomerContactSection';
import { CustomerIdentitySection } from './CustomerIdentitySection';
import { useCustomerForm } from './useCustomerForm';

interface CustomerFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<Customer>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  isSubmitting: boolean;
  /** Retour sans enregistrer (après la garde « quitter sans enregistrer »). */
  onLeave: () => void;
}

/**
 * Formulaire client au gabarit des formulaires : Identité (toujours ouverte), puis Contact,
 * Adresse et Notes internes, repliables. Le `<form>` englobe la carte et les actions.
 */
export function CustomerForm({ mode, defaultValues, onSubmit, isSubmitting, onLeave }: CustomerFormProps) {
  const t = useTranslations('customers.form');
  const { form, submit, sections } = useCustomerForm(mode, defaultValues, onSubmit);
  const { register, control, setValue, formState: { errors, isDirty } } = form;
  const notes = useWatch({ control, name: 'notes' });
  const cancel = useFormLeave(isDirty && !isSubmitting, onLeave);
  const fields = { control, register, errors };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <FormCard>
        <CustomerIdentitySection {...fields} />
        <CustomerContactSection {...fields} open={sections.isOpen('contact')} onToggle={() => sections.toggle('contact')} />
        <CustomerAddressSection {...fields} setValue={setValue}
          open={sections.isOpen('address')} onToggle={() => sections.toggle('address')} />
        <FormCollapsibleSection title={t('section_notes_internal')} description={t('section_notes_help')}
          summary={notes.replace(/\s+/g, ' ').trim()} icon={<NotebookPen size={19} strokeWidth={1.75} />}
          open={sections.isOpen('notes')} onToggle={() => sections.toggle('notes')}>
          <FormField label={t('notes')} wide>
            {(c) => <textarea {...c} {...register('notes')} dir="auto" rows={4} className={FIELD_TEXTAREA} />}
          </FormField>
        </FormCollapsibleSection>
      </FormCard>
      <FormActions
        dirty={isDirty}
        submitting={isSubmitting}
        submitLabel={mode === 'edit' ? t('submit_edit') : t('submit_create')}
        submitDisabled={mode === 'edit' && !isDirty}
        onCancel={cancel}
      />
    </form>
  );
}
