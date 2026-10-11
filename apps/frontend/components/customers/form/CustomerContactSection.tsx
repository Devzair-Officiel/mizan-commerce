'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { FormField } from '@/components/form/FormField';
import { FormSection } from '@/components/form/FormSection';
import { FIELD_CONTROL, FIELD_ROW } from '@/components/form/fieldStyles';
import { countryFlag } from '@/lib/countryFlag';
import { useShop } from '@/lib/hooks/useShop';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerContactSectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
  open: boolean;
  onToggle: () => void;
  order: string;
}

/** Contact (facultatif) : téléphone, normalisé au format international par le serveur, et e-mail. */
export function CustomerContactSection({ control, register, errors, open, onToggle, order }: CustomerContactSectionProps) {
  const t = useTranslations('customers.form');
  const { data: shop } = useShop();
  const [phone, email] = useWatch({ control, name: ['phone', 'email'] });
  // Numéro national : l'indicatif du pays de la boutique sera ajouté (drapeau). Sinon il est déjà là.
  const international = /^\s*(\+|00)/.test(phone);

  return (
    <FormSection order={order} title={t('section_contact')} status="optional" description={t('section_contact_help')}
      collapse={{ open, onToggle, summary: [phone.trim(), email.trim()].filter(Boolean).join(', ') }}>
      <div className={FIELD_ROW}>
        <FormField label={t('phone')} help={t('phone_help')} error={errors.phone?.message}>
          {(c) => (
            <div dir="ltr" className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-s-3.25 top-3 flex text-lg leading-none text-muted-foreground">
                {international || !shop?.country ? <Globe size={18} strokeWidth={1.75} /> : countryFlag(shop.country)}
              </span>
              <input {...c} {...register('phone')} type="tel" inputMode="tel" autoComplete="off" className={`${FIELD_CONTROL} ps-10.5`} />
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
