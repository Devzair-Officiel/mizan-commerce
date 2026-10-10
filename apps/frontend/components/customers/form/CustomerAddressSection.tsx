'use client';

import { Controller, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { CountryPicker } from '@/components/ui/CountryPicker';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerAddressSectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  setValue: UseFormSetValue<CustomerFormValues>;
  errors: Partial<Record<'city' | 'postal_code' | 'address_line', { message?: string }>>;
}

/** Pays, adresse (autocomplétion, toute la largeur), ville et code postal. */
export function CustomerAddressSection({ control, register, setValue, errors }: CustomerAddressSectionProps) {
  const t = useTranslations('customers.form');
  const country = useWatch({ control, name: 'country' });
  const fill = { shouldDirty: true, shouldValidate: true } as const;

  return (
    <FormSection title={t('section_address')} description={t('section_address_help')}>
      <FormField label={t('country')}>
        {({ id, 'aria-describedby': describedBy }) => (
          <Controller name="country" control={control} render={({ field }) => (
            <CountryPicker id={id} aria-describedby={describedBy} value={field.value} onChange={field.onChange} />
          )} />
        )}
      </FormField>
      <FormField label={t('address')} error={errors.address_line?.message} wide>
        {({ id, 'aria-describedby': describedBy }) => (
          <Controller name="address_line" control={control} render={({ field }) => (
            <AddressAutocomplete id={id} aria-describedby={describedBy} value={field.value} onChange={field.onChange} countryCode={country}
              onSelect={(result) => {
                if (result.city) setValue('city', result.city, fill);
                if (result.postal_code) setValue('postal_code', result.postal_code, fill);
                if (result.country_code) setValue('country', result.country_code, fill);
              }} />
          )} />
        )}
      </FormField>
      <FormField label={t('city')} error={errors.city?.message}>
        {(c) => <input {...c} {...register('city')} dir="auto" autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
      <FormField label={t('postal_code')} error={errors.postal_code?.message}>
        {(c) => <input {...c} {...register('postal_code')} autoComplete="off" className={FIELD_CONTROL} />}
      </FormField>
    </FormSection>
  );
}
