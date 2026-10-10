'use client';

import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Globe, Phone } from 'lucide-react';
import { FormCollapsibleSection } from '@/components/form/FormCollapsibleSection';
import { FormField } from '@/components/form/FormField';
import { FIELD_CONTROL } from '@/components/form/fieldStyles';
import { countryFlag } from '@/lib/countryFlag';
import { useShop } from '@/lib/hooks/useShop';
import type { CustomerFormValues } from './useCustomerForm';

interface CustomerContactSectionProps {
  control: Control<CustomerFormValues>;
  register: UseFormRegister<CustomerFormValues>;
  errors: FieldErrors<CustomerFormValues>;
  open: boolean;
  onToggle: () => void;
}

/** Contact (facultatif) : téléphone, normalisé au format international par le serveur, et e-mail. */
export function CustomerContactSection({ control, register, errors, open, onToggle }: CustomerContactSectionProps) {
  const t = useTranslations('customers.form');
  const { data: shop } = useShop();
  const [phone, email] = useWatch({ control, name: ['phone', 'email'] });
  // Numéro national : l'indicatif du pays de la boutique sera ajouté (drapeau). Sinon il est déjà là.
  const international = /^\s*(\+|00)/.test(phone);

  return (
    <FormCollapsibleSection title={t('section_contact')} description={t('section_contact_help')}
      summary={[phone.trim(), email.trim()].filter(Boolean).join(' · ')}
      icon={<Phone size={19} strokeWidth={1.75} />} open={open} onToggle={onToggle}>
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
        {(c) => <input {...c} {...register('email')} type="email" dir="ltr" autoComplete="off" className={`${FIELD_CONTROL} rtl:text-end`} />}
      </FormField>
    </FormCollapsibleSection>
  );
}
