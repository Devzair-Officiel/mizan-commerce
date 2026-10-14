'use client';

import { useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { StickyNote } from 'lucide-react';
import { FormActions } from '@/components/form/FormActions';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_TEXTAREA, FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import { useFormLeave } from '@/components/form/useFormLeave';
import { useReminderAssignees, type ReminderPayload } from '@/lib/hooks/useReminders';
import { ReminderAssigneeSection } from './ReminderAssigneeSection';
import { ReminderLinkSection } from './ReminderLinkSection';
import { ReminderMainSection } from './ReminderMainSection';
import { useReminderForm, type ReminderCategory, type ReminderDefaults, type ReminderSection } from './useReminderForm';

/** Catégories proposées, dans l'ordre de la maquette ; la zakat n'apparaît que sur ses propres rappels. */
const CATEGORIES: readonly ReminderCategory[] = ['customer_followup', 'order_prep', 'unpaid', 'free'];

interface ReminderFormProps {
  mode: 'create' | 'edit';
  defaultValues?: ReminderDefaults;
  onSubmit: (payload: ReminderPayload) => Promise<void>;
  isSubmitting: boolean;
  /** Retour sans enregistrer (après la garde « quitter sans enregistrer »). */
  onLeave: () => void;
}

/**
 * Formulaire de rappel au gabarit v3. Colonne principale : Rappel, Notes ; colonne latérale :
 * Lié à, Pour qui (masquée sans équipe). Sur mobile : Rappel, Notes, Lié à, Pour qui.
 */
export function ReminderForm({ mode, defaultValues, onSubmit, isSubmitting, onLeave }: ReminderFormProps) {
  const t = useTranslations('reminders.form');
  const { form, submit, sections } = useReminderForm(defaultValues, onSubmit);
  const { register, control, setValue, formState: { errors, isDirty } } = form;
  const [description, customer, order, assignedTo] = useWatch({ control, name: ['description', 'customer', 'order', 'assigned_to'] });
  const { data: members = [] } = useReminderAssignees();
  const cancel = useFormLeave(isDirty && !isSubmitting, onLeave);
  const section = (name: ReminderSection) => ({ open: sections.isOpen(name), onToggle: () => sections.toggle(name) });
  const categories = defaultValues?.category === 'zakat' ? [...CATEGORIES, 'zakat' as const] : CATEGORIES;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 px-4 pt-4 pb-28 lg:pt-0 lg:pb-8">
      <div className={FORM_COLUMNS}>
        <div className={FORM_COLUMN}>
          <ReminderMainSection control={control} register={register} setValue={setValue} errors={errors} categories={categories} />
          <FormSection icon={StickyNote} order="max-lg:order-2" title={t('section_notes')} status="optional"
            collapse={{ ...section('notes'), summary: description.replace(/\s+/g, ' ').trim() }}>
            <FormField label={t('notes')}>
              {(c) => <textarea {...c} {...register('description')} dir="auto" rows={3} placeholder={t('notes_placeholder')} className={FIELD_TEXTAREA} />}
            </FormField>
          </FormSection>
        </div>
        <div className={FORM_COLUMN}>
          <ReminderLinkSection control={control} setValue={setValue} errors={errors} customer={customer} order={order} {...section('link')} />
          {/* Un seul membre : pas d'équipe, rien à attribuer. */}
          {members.length > 1 && <ReminderAssigneeSection control={control} members={members} assignedTo={assignedTo} {...section('assignee')} />}
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
