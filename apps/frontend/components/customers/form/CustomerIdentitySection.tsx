'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { customerInitials } from '@/components/customers/detail/constants';
import { SegmentedField } from '@/components/export/SegmentedField';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerIdentitySectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
  order: string;
}

/** Identité (obligatoire) : aperçu du client tel qu'il apparaîtra (initiales et nom, mis à jour pendant la saisie), prénom et nom,
 * particulier ou professionnel (SIREN facultatif, repris sur ses factures). */
export function CustomerIdentitySection({ control, register, errors, order }: CustomerIdentitySectionProps) {
  const t = useTranslations('customers.form');
  const [firstName, name, type] = useWatch({ control, name: ['first_name', 'name', 'customer_type'] });
  const initials = customerInitials(firstName, name);
  const fullName = `${firstName.trim()} ${name.trim()}`.trim();

  return (
    <FormSection icon={UserRound} order={order} title={t('section_identity')} status="required">
      <div className="flex items-center gap-3.5 rounded-xl bg-muted p-3.5">
        <span aria-hidden className="flex size-13 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-bold text-secondary-foreground">
          {initials || <UserRound size={22} strokeWidth={1.75} />}
        </span>
        <div className="min-w-0">
          <p dir="auto" className={`truncate text-[0.9375rem] font-semibold ${fullName ? 'text-foreground' : 'text-muted-foreground'}`}>
            {fullName || t('preview_empty')}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{t('preview_help')}</p>
        </div>
      </div>
      <div className={FIELD_ROW}>
        <FormField label={t('first_name')} error={errors.first_name?.message}>
          {(c) => <input {...c} {...register('first_name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
        </FormField>
        <FormField label={t('name')} required error={errors.name?.message}>
          {(c) => <input {...c} {...register('name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
        </FormField>
      </div>
      <SegmentedField label={t('customer_type')} register={register('customer_type')} columns="grid-cols-2"
        options={(['individual', 'business'] as const).map((value) => ({ value, label: t('customer_type_option', { value }) }))} />
      {type === 'business' && <FormField label={t('siren')} help={t('siren_help')} error={errors.siren?.message}>
        {(c) => <input {...c} {...register('siren')} inputMode="numeric" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>}
    </FormSection>
  );
}
