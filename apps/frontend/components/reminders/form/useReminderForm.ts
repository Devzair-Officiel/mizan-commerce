'use client';

import { useMemo } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useFormSections } from '@/components/form/useFormSections';
import { ApiError } from '@/lib/api-client';
import type { ReminderPayload } from '@/lib/hooks/useReminders';
import { notify } from '@/lib/notify';
import { fromInputs, toDateInput, toTimeInput, tomorrowAt } from '../reminderDates';

/** Ordre d'affichage : la première erreur dans cet ordre reçoit le focus. */
const FIELDS = ['title', 'date', 'time', 'category', 'description', 'customer', 'order', 'assigned_to'] as const;
type ReminderField = (typeof FIELDS)[number];
export type ReminderSection = 'notes' | 'link' | 'assignee';

/** Section repliable de chaque champ (la carte « Rappel » est toujours ouverte). */
const SECTION_OF: Partial<Record<ReminderField, ReminderSection>> = {
  description: 'notes', customer: 'link', order: 'link', assigned_to: 'assignee',
};

/** Champ de l'API → champ du formulaire (l'échéance est saisie en date et heure). */
const FIELD_OF_SERVER: Record<string, ReminderField> = { due_at: 'date' };

export const REMINDER_CATEGORIES = ['customer_followup', 'order_prep', 'unpaid', 'free', 'zakat'] as const;
export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

/** Longueur maximale du titre = celle du modèle `Reminder`. */
function reminderSchema(t: (key: string, values?: { max: number }) => string) {
  return z.object({
    title: z.string().trim().min(1, t('title_required')).max(200, t('too_long', { max: 200 })),
    date: z.string().min(1, t('date_required')),
    time: z.string().min(1, t('time_required')),
    category: z.enum(REMINDER_CATEGORIES),
    description: z.string(),
    /** Identifiants ; vide : aucun client, aucune commande, toute l'équipe. */
    customer: z.string(),
    order: z.string(),
    assigned_to: z.string(),
  });
}

export type ReminderFormValues = z.infer<ReturnType<typeof reminderSchema>>;

/** Rappel enregistré, ou liens pré-remplis depuis une fiche client ou commande. */
export interface ReminderDefaults {
  title?: string;
  due_at?: string;
  category?: string;
  description?: string;
  customer?: string | null;
  order?: string | null;
  assigned_to?: string | null;
}

function initialValues(d: ReminderDefaults | undefined): ReminderFormValues {
  const due = d?.due_at ? new Date(d.due_at) : tomorrowAt(9);
  const category = REMINDER_CATEGORIES.find((c) => c === d?.category) ?? 'free';
  return {
    title: d?.title ?? '', date: toDateInput(due), time: toTimeInput(due), category,
    description: d?.description ?? '', customer: d?.customer ?? '', order: d?.order ?? '', assigned_to: d?.assigned_to ?? '',
  };
}

/** Champs en erreur renvoyés par l'API (`{detail, errors: {champ: [...]}}`), dans l'ordre d'affichage. */
function serverFieldErrors(err: unknown): ReminderField[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const errors = (err.data as { errors?: unknown } | null)?.errors;
  if (!errors || typeof errors !== 'object') return [];
  const fields = new Set(Object.keys(errors).map((key) => FIELD_OF_SERVER[key] ?? key));
  return FIELDS.filter((f) => fields.has(f));
}

/**
 * Valeurs, sections et soumission du formulaire de rappel. Une erreur (schéma ou serveur) ouvre
 * la section de son champ et y place le focus ; l'échec global est notifié.
 */
export function useReminderForm(defaults: ReminderDefaults | undefined, onSubmit: (payload: ReminderPayload) => Promise<void>) {
  const t = useTranslations('reminders.form');
  const schema = useMemo(() => reminderSchema(t), [t]);
  const form = useForm<ReminderFormValues>({
    resolver: zodResolver(schema),
    shouldFocusError: false,
    defaultValues: initialValues(defaults),
  });
  const sections = useFormSections(SECTION_OF, form.setFocus);

  const onInvalid = (errors: FieldErrors<ReminderFormValues>) => {
    const first = FIELDS.find((f) => errors[f]);
    if (first) sections.reveal(first);
  };

  const submit = form.handleSubmit(async ({ date, time, customer, order, assigned_to, ...values }) => {
    const dueAt = fromInputs(date, time);
    if (!dueAt) {
      form.setError('date', { type: 'validate', message: t('date_invalid') });
      return sections.reveal('date');
    }
    try {
      await onSubmit({ ...values, due_at: dueAt, customer: customer || null, order: order || null, assigned_to: assigned_to || null });
    } catch (err) {
      const fields = serverFieldErrors(err);
      for (const f of fields) form.setError(f, { type: 'server', message: t('field_invalid') });
      const [first] = fields;
      if (first) sections.reveal(first);
      else notify.error(t('save_failed'));
    }
  }, onInvalid);

  return { form, submit, sections };
}
