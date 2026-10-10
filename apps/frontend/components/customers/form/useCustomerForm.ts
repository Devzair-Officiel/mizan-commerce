'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import type { Customer, CustomerFormData } from '@/lib/hooks/useCustomers';

const FIELDS = ['first_name', 'name', 'phone', 'email', 'country', 'address_line', 'city', 'postal_code', 'notes'] as const;

/** Longueurs maximales = celles du modèle `Customer`. */
function customerSchema(t: (key: string, values?: { max: number }) => string) {
  const text = (max: number) => z.string().trim().max(max, t('too_long', { max }));
  return z.object({
    first_name: text(100),
    name: text(150).min(1, t('name_required')),
    phone: text(30),
    email: z.union([z.literal(''), z.string().trim().max(254, t('too_long', { max: 254 })).email(t('email_invalid'))]),
    country: z.string(),
    address_line: text(255),
    city: text(100),
    postal_code: text(20),
    notes: z.string(),
  });
}

export type CustomerFormValues = z.infer<ReturnType<typeof customerSchema>>;

/** Erreurs de validation renvoyées par l'API (`{detail, errors: {champ: [...]}}`). */
function serverFieldErrors(err: unknown): string[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const errors = (err.data as { errors?: unknown } | null)?.errors;
  return errors && typeof errors === 'object' ? Object.keys(errors) : [];
}

/** Valeurs et soumission du formulaire client ; erreurs serveur affichées sous le champ. */
export function useCustomerForm(defaults: Partial<Customer> | undefined, onSubmit: (data: CustomerFormData) => Promise<void>) {
  const t = useTranslations('customers.form');
  const [failed, setFailed] = useState(false);
  const schema = useMemo(() => customerSchema(t), [t]);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    // Valeurs telles qu'enregistrées : un nom complet saisi dans « Nom » n'est pas découpé.
    defaultValues: Object.fromEntries(FIELDS.map((f) => [f, defaults?.[f] ?? ''])) as CustomerFormValues,
  });

  const submit = form.handleSubmit(async (values) => {
    setFailed(false);
    try {
      await onSubmit(values);
    } catch (err) {
      const fields = serverFieldErrors(err).filter((f): f is (typeof FIELDS)[number] => (FIELDS as readonly string[]).includes(f));
      // Seul le nom est contrôlé côté serveur au-delà du schéma : l'unicité dans la boutique.
      for (const f of fields) form.setError(f, { type: 'server', message: f === 'name' ? t('name_taken') : t('field_invalid') });
      if (fields.length === 0) setFailed(true);
    }
  });

  return { form, submit, failed };
}
