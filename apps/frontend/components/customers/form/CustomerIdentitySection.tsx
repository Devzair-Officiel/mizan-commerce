'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { getInitials } from '@/components/customers/detail/constants';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerIdentitySectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
  order: string;
}

/** Identité (obligatoire) : aperçu du client tel qu'il apparaîtra (initiales et nom, mis à jour pendant la saisie), prénom et nom. */
export function CustomerIdentitySection({ control, register, errors, order }: CustomerIdentitySectionProps) {
  const t = useTranslations('customers.form');
  const [firstName, name] = useWatch({ control, name: ['first_name', 'name'] });
  // Prénom + dernier mot du nom (« Amine » + « Benchekroun » → AB) ; sans prénom, le nom seul.
  const initials = getInitials(firstName.trim() ? `${firstName} ${name.trim().split(/\s+/).pop() ?? ''}` : name);
  const fullName = `${firstName.trim()} ${name.trim()}`.trim();

  return (
    <FormSection order={order} title={t('section_identity')} status="required">
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
    </FormSection>
  );
}
