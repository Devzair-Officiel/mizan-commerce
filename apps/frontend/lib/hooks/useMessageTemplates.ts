import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import type { PreparedMessageTemplate } from '@/lib/hooks/usePreparedMessages';
import { qk } from '@/lib/query-keys';

/** Modèles modifiables, dans l'ordre de la page Paramètres › Messages WhatsApp. */
export const MESSAGE_TEMPLATES = ['order_confirmation', 'tracking', 'unpaid_followup', 'thank_you', 'promo'] as const;
export type MessageTemplateKey = (typeof MESSAGE_TEMPLATES)[number];

export const MESSAGE_TONES = ['warm', 'professional'] as const;
export type MessageTone = (typeof MESSAGE_TONES)[number];

export interface MessageSettings {
  tone: MessageTone;
  /** Textes personnalisés ; un modèle absent suit le texte du ton choisi. */
  texts: Partial<Record<MessageTemplateKey, string>>;
  /** Textes par défaut des deux tons, dans la langue de l'interface. */
  defaults: Record<MessageTone, Record<MessageTemplateKey, string>>;
  /** Noms des variables permises, sans accolades. */
  variables: string[];
}

export interface MessageSettingsUpdate {
  tone?: MessageTone;
  /** `null` : retour au texte du ton choisi. */
  texts?: Partial<Record<MessageTemplateKey, string | null>>;
}

export interface MessagePreview {
  message: string;
  order_number: string;
  customer_name: string;
  /** Aucune commande dans la boutique : exemple fictif. */
  is_sample: boolean;
  unknown_variables: string[];
}

/** Message à préparer : une commande (modèle de son étape si `template` est absent) ou un client. */
export interface ComposeRequest {
  template?: PreparedMessageTemplate;
  orderId?: string | null;
  customerId?: string | null;
}

export interface ComposedMessage {
  template_type: PreparedMessageTemplate;
  message: string;
}

const PREVIEW_DELAY_MS = 400;

export function useMessageSettings() {
  const lang = useLocale();
  return useQuery({
    queryKey: qk.messageTemplates.settings(lang),
    queryFn: () => apiFetch<MessageSettings>(`/messages/settings/?lang=${lang}`),
  });
}

export function useUpdateMessageSettings() {
  const qc = useQueryClient();
  const lang = useLocale();
  return useMutation({
    mutationFn: (data: MessageSettingsUpdate) =>
      apiFetch<MessageSettings>(`/messages/settings/?lang=${lang}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (data) => {
      qc.setQueryData(qk.messageTemplates.settings(lang), data);
      return qc.invalidateQueries({ queryKey: qk.messageTemplates.all });
    },
  });
}

/** Rendu de `text` sur la dernière commande de la boutique, une fois la saisie posée. */
export function useMessagePreview(text: string, tone: MessageTone) {
  const lang = useLocale();
  const [debounced, setDebounced] = useState({ text, tone });

  useEffect(() => {
    const id = setTimeout(() => setDebounced({ text, tone }), PREVIEW_DELAY_MS);
    return () => clearTimeout(id);
  }, [text, tone]);

  return useQuery({
    queryKey: qk.messageTemplates.preview(debounced.text, debounced.tone, lang),
    queryFn: () => apiFetch<MessagePreview>('/messages/preview/', {
      method: 'POST',
      body: JSON.stringify({ text: debounced.text, tone: debounced.tone, lang }),
    }),
    placeholderData: keepPreviousData,
  });
}

/** Texte du message préparé, rendu par le serveur avec les modèles de la boutique. */
export function useComposedMessage({ template, orderId, customerId }: ComposeRequest, enabled = true) {
  const lang = useLocale();
  const request = { template: template ?? null, order_id: orderId ?? null, customer_id: customerId ?? null };
  return useQuery({
    queryKey: qk.messageTemplates.compose(request, lang),
    queryFn: () => apiFetch<ComposedMessage>('/messages/compose/', {
      method: 'POST',
      body: JSON.stringify({ ...request, lang }),
    }),
    // Recalculé à chaque ouverture : la commande ou les modèles ont pu changer.
    gcTime: 0,
    enabled,
  });
}
