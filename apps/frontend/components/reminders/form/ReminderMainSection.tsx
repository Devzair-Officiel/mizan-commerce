'use client';

import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { ReminderCategoryField } from './ReminderCategoryField';
import { ReminderWhenField } from './ReminderWhenField';
import type { ReminderCategory, ReminderFormValues } from './useReminderForm';

interface ReminderMainSectionProps {
  control: Control<ReminderFormValues>;
  register: UseFormRegister<ReminderFormValues>;
  setValue: UseFormSetValue<ReminderFormValues>;
  errors: FieldErrors<ReminderFormValues>;
  categories: readonly ReminderCategory[];
}

/** Carte « Rappel » (obligatoire) : titre, échéance et catégorie. */
export function ReminderMainSection({ control, register, setValue, errors, categories }: ReminderMainSectionProps) {
  const t = useTranslations('reminders.form');
  return (
    <FormSection icon={Bell} order="max-lg:order-1" title={t('section_main')} status="required">
      <FormField label={t('title')} required error={errors.title?.message}>
        {(c) => <input {...c} {...register('title')} dir="auto" autoComplete="off" placeholder={t('title_placeholder')} className={FIELD_CONTROL} />}
      </FormField>
      <ReminderWhenField control={control} register={register} setValue={setValue} errors={errors} />
      <ReminderCategoryField register={register} options={categories} />
    </FormSection>
  );
}
