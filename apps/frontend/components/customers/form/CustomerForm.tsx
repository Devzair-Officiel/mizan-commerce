'use client';

import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { StickyNote } from 'lucide-react';
import { FormActions } from '@/components/form/FormActions';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_TEXTAREA, FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import type { Customer, CustomerFormData } from '@/lib/hooks/useCustomers';
import { CustomerAddressSection } from './CustomerAddressSection';
import { CustomerContactSection } from './CustomerContactSection';
import { CustomerIdentitySection } from './CustomerIdentitySection';
import { useCustomerForm, type CustomerSection } from './useCustomerForm';

interface CustomerFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<Customer>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  isSubmitting: boolean;
  /** Retour sans enregistrer (après la garde « quitter sans enregistrer »). */
  onLeave: () => void;
}

/**
 * Formulaire client au gabarit v3. Colonne principale : Identité, Contact, Adresse ; colonne
 * latérale : Notes internes. Sur mobile, les cartes s'empilent dans cet ordre.
 */
export function CustomerForm({ mode, defaultValues, onSubmit, isSubmitting, onLeave }: CustomerFormProps) {
  const t = useTranslations('customers.form');
  const { form, submit, sections } = useCustomerForm(mode, defaultValues, onSubmit);
  const { register, control, setValue, formState: { errors, isDirty } } = form;
  const notes = useWatch({ control, name: 'notes' });
  const cancel = useFormLeave(isDirty && !isSubmitting, onLeave);
  const fields = { control, register, errors };
  const section = (name: CustomerSection) => ({ open: sections.isOpen(name), onToggle: () => sections.toggle(name) });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <div className={FORM_COLUMNS}>
        <div className={FORM_COLUMN}>
          <CustomerIdentitySection {...fields} order="max-lg:order-1" />
          <CustomerContactSection {...fields} {...section('contact')} order="max-lg:order-2" />
          <CustomerAddressSection {...fields} setValue={setValue} {...section('address')} order="max-lg:order-3" />
        </div>
        <div className={FORM_COLUMN}>
          <FormSection icon={StickyNote} order="max-lg:order-4" title={t('section_notes_internal')} status="optional" description={t('section_notes_help')}
            collapse={{ ...section('notes'), summary: notes.replace(/\s+/g, ' ').trim() }}>
            <FormField label={t('notes')}>
              {(c) => <textarea {...c} {...register('notes')} dir="auto" rows={3} placeholder={t('notes_placeholder')} className={FIELD_TEXTAREA} />}
            </FormField>
          </FormSection>
        </div>
      </div>
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
