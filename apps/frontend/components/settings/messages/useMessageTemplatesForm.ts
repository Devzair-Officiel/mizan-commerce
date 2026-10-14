'use client';

import { useMemo } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import {
  MESSAGE_TEMPLATES, MESSAGE_TONES, useUpdateMessageSettings,
  type MessageSettings, type MessageTemplateKey,
} from '@/lib/hooks/useMessageTemplates';
import { notify } from '@/lib/notify';
import { resetKeepingEdits } from '@/components/form/resetKeepingEdits';

/** Même lecture des variables que le serveur (`comms.services._VARIABLE_RE`). */
const VARIABLE_RE = /\{([^{}]*)\}/g;

export function unknownVariables(text: string, allowed: readonly string[]): string[] {
  const names = [...text.matchAll(VARIABLE_RE)].map((m) => m[1] ?? '');
  return [...new Set(names.filter((name) => !allowed.includes(name)))];
}

const braces = (names: readonly string[]) => names.map((n) => `{${n}}`).join(', ');

/** Texte personnalisé d'un modèle ; `null` : texte du ton choisi. */
function messagesSchema(t: (key: string, values?: Record<string, string>) => string, variables: readonly string[]) {
  const text = z.string().nullable().superRefine((value, ctx) => {
    if (value === null) return;
    if (!value.trim()) ctx.addIssue({ code: 'custom', message: t('text_required') });
    const unknown = unknownVariables(value, variables);
    if (unknown.length > 0) {
      ctx.addIssue({ code: 'custom', message: t('unknown_variable', { names: braces(unknown), allowed: braces(variables) }) });
    }
  });
  return z.object({
    tone: z.enum(MESSAGE_TONES),
    custom: z.object({ order_confirmation: text, tracking: text, unpaid_followup: text, thank_you: text, promo: text }),
  });
}

export type MessageTemplatesValues = z.infer<ReturnType<typeof messagesSchema>>;

function valuesOf(settings: MessageSettings): MessageTemplatesValues {
  const custom = Object.fromEntries(MESSAGE_TEMPLATES.map((k) => [k, settings.texts[k] ?? null]));
  return { tone: settings.tone, custom: custom as MessageTemplatesValues['custom'] };
}

/** Modèles refusés par le serveur (`{detail, errors: {texts: {modèle: [...]}}}`). */
function serverTemplateErrors(err: unknown): MessageTemplateKey[] {
  if (!(err instanceof ApiError) || err.status !== 400) return [];
  const texts = (err.data as { errors?: { texts?: unknown } } | null)?.errors?.texts;
  if (!texts || typeof texts !== 'object') return [];
  return MESSAGE_TEMPLATES.filter((k) => k in texts);
}

/**
 * Ton et textes personnalisés des modèles. Une erreur (schéma ou serveur) affiche le modèle
 * concerné (`reveal`) ; l'échec global est notifié.
 */
export function useMessageTemplatesForm(settings: MessageSettings, reveal: (key: MessageTemplateKey) => void) {
  const t = useTranslations('settings.messages');
  const schema = useMemo(() => messagesSchema(t, settings.variables), [t, settings.variables]);
  const form = useForm<MessageTemplatesValues>({ resolver: zodResolver(schema), defaultValues: valuesOf(settings) });
  const update = useUpdateMessageSettings();

  const onInvalid = (errors: FieldErrors<MessageTemplatesValues>) => {
    const first = MESSAGE_TEMPLATES.find((k) => errors.custom?.[k]);
    if (first) reveal(first);
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({ tone: values.tone, texts: values.custom });
      resetKeepingEdits(form, valuesOf(saved), values);
      notify.success(t('saved'));
    } catch (err) {
      const keys = serverTemplateErrors(err);
      for (const k of keys) form.setError(`custom.${k}`, { type: 'server', message: t('text_invalid', { allowed: braces(settings.variables) }) });
      const [first] = keys;
      if (first) reveal(first);
      else notify.error(t('save_failed'));
    }
  }, onInvalid);

  return { form, submit, isSubmitting: update.isPending };
}
