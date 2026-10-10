'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormRequiredSection } from '@/components/form/FormRequiredSection';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { getInitials } from '@/components/customers/detail/constants';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerIdentitySectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
}

/** Identité (obligatoire) : avatar aux initiales, mises à jour pendant la saisie, prénom et nom. */
export function CustomerIdentitySection({ control, register, errors }: CustomerIdentitySectionProps) {
  const t = useTranslations('customers.form');
  const [firstName, name] = useWatch({ control, name: ['first_name', 'name'] });
  // Prénom + dernier mot du nom (« Amine » + « Benchekroun » → AB) ; sans prénom, le nom seul.
  const initials = getInitials(firstName.trim() ? `${firstName} ${name.trim().split(/\s+/).pop() ?? ''}` : name);

  const avatar = (
    <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-[1.1875rem] font-bold text-secondary-foreground">
      {initials || <UserRound size={24} strokeWidth={1.75} />}
    </span>
  );
  return (
    <FormRequiredSection title={t('section_identity')} description={t('section_identity_help')} leading={avatar}>
      <FormField label={t('first_name')} error={errors.first_name?.message}>
        {(c) => <input {...c} {...register('first_name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('name')} required error={errors.name?.message}>
        {(c) => <input {...c} {...register('name')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
    </FormRequiredSection>
  );
}
