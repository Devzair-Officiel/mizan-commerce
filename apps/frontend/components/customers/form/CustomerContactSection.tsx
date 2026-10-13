'use client';

import { useController, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { PhoneCountrySelect } from '@/components/form/PhoneCountrySelect';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { useShop } from '@/lib/hooks/useShop';
import { phoneCountry } from '@/lib/phone';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerContactSectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
  open: boolean;
  onToggle: () => void;
  order: string;
}

/** Contact (facultatif) : indicatif du pays et numéro national (normalisé au format international par le serveur), e-mail. */
export function CustomerContactSection({ control, register, errors, open, onToggle, order }: CustomerContactSectionProps) {
  const t = useTranslations('customers.form');
  const { data: shop } = useShop();
  const [phone, email] = useWatch({ control, name: ['phone', 'email'] });
  // Indicatif vide : celui du pays de la boutique.
  const { field: dial } = useController({ control, name: 'phone_country' });

  return (
    <FormSection icon={Phone} order={order} title={t('section_contact')} status="optional" description={t('section_contact_help')}
      collapse={{ open, onToggle, summary: [phone.trim(), email.trim()].filter(Boolean).join(', ') }}>
      <div className={FIELD_ROW}>
        <FormField label={t('phone')} help={t('phone_help')} error={errors.phone?.message}>
          {(c) => (
            <div dir="ltr" className="flex gap-2">
              <PhoneCountrySelect value={phoneCountry(dial.value || shop?.country)} onChange={dial.onChange} />
              <input {...c} {...register('phone')} type="tel" inputMode="tel" autoComplete="off" className={FIELD_CONTROL} />
            </div>
          )}
        </FormField>
        <FormField label={t('email')} error={errors.email?.message}>
          {(c) => <input {...c} {...register('email')} type="email" dir="ltr" autoComplete="off" placeholder={t('email_placeholder')} className={`${FIELD_CONTROL} rtl:text-end`} />}
        </FormField>
      </div>
    </FormSection>
  );
}
