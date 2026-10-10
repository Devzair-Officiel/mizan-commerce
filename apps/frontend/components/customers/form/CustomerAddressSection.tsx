'use client';

import { Controller, useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete';
import { CountryPicker } from '@/components/ui/CountryPicker';
import { useCountryNames } from '@/lib/hooks/useCountryNames';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerAddressSectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  setValue: UseFormSetValue<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
  open: boolean;
  onToggle: () => void;
}

/** Adresse (facultative) : pays, adresse (autocomplétion, toute la largeur), ville et code postal. */
export function CustomerAddressSection({ control, register, setValue, errors, open, onToggle }: CustomerAddressSectionProps) {
  const t = useTranslations('customers.form');
  const countryName = useCountryNames();
  const [country, address, city, postalCode] = useWatch({ control, name: ['country', 'address_line', 'city', 'postal_code'] });
  const fill = { shouldDirty: true, shouldValidate: true } as const;
  // « 2, avenue de Fouquet, 39275 Grenoble, France »
  const summary = [address.trim(), `${postalCode.trim()} ${city.trim()}`.trim(), country ? countryName(country) : '']
    .filter(Boolean).join(', ');

  return (
    <FormCollapsibleSection title={t('section_address')} description={t('section_address_help')} summary={summary}
      icon={<MapPin size={19} strokeWidth={1.75} />} open={open} onToggle={onToggle}>
      <FormField label={t('country')}>
        {({ id, 'aria-describedby': describedBy }) => (
          <Controller name="country" control={control} render={({ field }) => (
            <CountryPicker id={id} aria-describedby={describedBy} value={field.value} onChange={field.onChange} />
          )} />
        )}
      </FormField>
      <FormField label={t('address')} error={errors.address_line?.message} wide>
        {({ id, 'aria-describedby': describedBy, 'aria-invalid': invalid }) => (
          <Controller name="address_line" control={control} render={({ field }) => (
            <AddressAutocomplete ref={field.ref} id={id} aria-describedby={describedBy} aria-invalid={invalid}
              value={field.value} onChange={field.onChange} countryCode={country}
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
    </FormCollapsibleSection>
  );
}
