'use client';

import { useMemo } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useFormSections } from '@/components/form/useFormSections';
import { ApiError } from '@/lib/api-client';
import type { Customer, CustomerFormData } from '@/lib/hooks/useCustomers';
import { useShop } from '@/lib/hooks/useShop';
import { notify } from '@/lib/notify';
import { joinPhone, phoneCountry, splitPhone } from '@/lib/phone';

/** Ordre d'affichage : la première erreur dans cet ordre reçoit le focus. */
const FIELDS = ['first_name', 'name', 'phone', 'email', 'country', 'address_line', 'city', 'postal_code', 'notes'] as const;
type CustomerField = (typeof FIELDS)[number];
export type CustomerSection = 'contact' | 'address' | 'notes';

/** Section repliable de chaque champ (l'identité est toujours ouverte). */
const SECTION_OF: Partial<Record<CustomerField, CustomerSection>> = {
  phone: 'contact', email: 'contact',
  country: 'address', address_line: 'address', city: 'address', postal_code: 'address',
  notes: 'notes',
};

/** Longueurs maximales = celles du modèle `Customer`. */
function customerSchema(t: (key: string, values?: { max: number }) => string) {
  const text = (max: number) => z.string().trim().max(max, t('too_long', { max }));
  return z.object({
    first_name: text(100),
    name: text(150).min(1, t('name_required')),
    phone: text(30),
    /** Indicatif choisi (code ISO) ; vide : celui du pays de la boutique. */
    phone_country: z.string(),
    email: z.union([z.literal(''), z.string().trim().max(254, t('too_long', { max: 254 })).email(t('email_invalid'))]),
    country: z.string(),
    address_line: text(255),
    city: text(100),
    postal_code: text(20),
    notes: z.string(),
  });
}

export type CustomerFormValues = z.infer<ReturnType<typeof customerSchema>>;

/** Champs en erreur renvoyés par l'API (`{detail, errors: {champ: [...]}}`), dans l'ordre d'affichage. */
function serverFieldErrors(err: unknown): CustomerField[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const errors = (err.data as { errors?: unknown } | null)?.errors;
  return errors && typeof errors === 'object' ? FIELDS.filter((f) => f in errors) : [];
}

/** Message d'une erreur serveur : unicité du nom, numéro invalide, sinon générique. */
const SERVER_MESSAGE: Partial<Record<CustomerField, string>> = { name: 'name_taken', phone: 'phone_invalid' };

/**
 * Valeurs, sections et soumission du formulaire client. Une erreur (schéma ou serveur) ouvre la
 * section de son champ et y place le focus ; succès et échec global sont notifiés.
 */
export function useCustomerForm(mode: 'create' | 'edit', defaults: Partial<Customer> | undefined, onSubmit: (data: CustomerFormData) => Promise<void>) {
  const t = useTranslations('customers.form');
  const { data: shop } = useShop();
  const schema = useMemo(() => customerSchema(t), [t]);
  // Valeurs telles qu'enregistrées : un nom complet saisi dans « Nom » n'est pas découpé.
  // Le téléphone enregistré (E.164) donne l'indicatif et le numéro national affiché.
  const stored = splitPhone(defaults?.phone ?? '');
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    shouldFocusError: false,
    defaultValues: {
      ...Object.fromEntries(FIELDS.map((f) => [f, (f === 'phone' ? stored.national : defaults?.[f]) || ''])),
      phone_country: stored.country ?? '',
    } as CustomerFormValues,
  });
  const sections = useFormSections(SECTION_OF, form.setFocus);

  const onInvalid = (errors: FieldErrors<CustomerFormValues>) => {
    const first = FIELDS.find((f) => errors[f]);
    if (first) sections.reveal(first);
  };

  const submit = form.handleSubmit(async ({ phone_country, ...values }) => {
    try {
      // Numéro complet (indicatif + numéro national) : le serveur le normalise en E.164.
      await onSubmit({ ...values, phone: joinPhone(phoneCountry(phone_country || shop?.country), values.phone) });
      notify.success(t(mode === 'edit' ? 'toast_saved' : 'toast_created'));
    } catch (err) {
      const fields = serverFieldErrors(err);
      for (const f of fields) form.setError(f, { type: 'server', message: t(SERVER_MESSAGE[f] ?? 'field_invalid') });
      const [first] = fields;
      if (first) sections.reveal(first);
      else notify.error(t('save_failed'));
    }
  }, onInvalid);

  return { form, submit, sections };
}
