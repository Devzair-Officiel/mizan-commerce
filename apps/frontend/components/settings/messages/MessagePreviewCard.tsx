'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import { FormSection } from '@/components/form/FormSection';
import { orderNumberTag } from '@/components/orders/OrderNumber';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { useMessagePreview, type MessageTone } from '@/lib/hooks/useMessageTemplates';

/**
 * Aperçu façon WhatsApp du texte en cours de saisie, rendu par le serveur sur la dernière commande
 * de la boutique (ou un exemple fictif), une fois la saisie posée.
 */
export function MessagePreviewCard({ text, tone }: { text: string; tone: MessageTone }) {
  const t = useTranslations('settings.messages');
  const formatDate = useFormatDate();
  const { data: preview, isError } = useMessagePreview(text, tone);
  // Heure de la bulle : celle de l'ouverture de la page, comme un message qu'on vient d'écrire.
  const [now] = useState(() => new Date());

  return (
    <FormSection icon={Eye} order="max-lg:order-3" title={t('preview_title')}>
      <div className="rounded-[0.875rem] bg-muted p-3.5" aria-live="polite">
        {preview ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {t.rich('preview_caption', {
                sample: String(preview.is_sample), number: preview.order_number, name: preview.customer_name, num: orderNumberTag,
              })}
            </p>
            <div dir="auto" className="ms-auto max-w-75 whitespace-pre-line rounded-[0.875rem] rounded-ee-sm bg-secondary px-3 py-2.5 text-sm leading-normal text-foreground">
              {preview.message}
              <div className="mt-1 text-end text-[0.6875rem] text-muted-foreground">{formatDate(now, { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            {preview.unknown_variables.length > 0 && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                {t('preview_unknown', { names: preview.unknown_variables.map((n) => `{${n}}`).join(', ') })}
              </p>
            )}
          </>
        ) : isError ? (
          <p className="text-xs text-muted-foreground">{t('preview_failed')}</p>
        ) : (
          <div className="ms-auto h-32 max-w-75 animate-pulse rounded-[0.875rem] bg-secondary" />
        )}
      </div>
      <p className="text-[0.8125rem] leading-normal text-muted-foreground">{t('preview_note')}</p>
    </FormSection>
  );
}
