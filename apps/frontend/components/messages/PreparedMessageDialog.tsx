'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useIsAdmin } from '@/lib/hooks/useMe';
import { MESSAGE_TEMPLATES, useComposedMessage, type ComposeRequest } from '@/lib/hooks/useMessageTemplates';
import { usePlanGating } from '@/lib/hooks/usePlanGating';
import { useCreatePreparedMessage, type PreparedMessageContext } from '@/lib/hooks/usePreparedMessages';
import { notify } from '@/lib/notify';

interface PreparedMessageDialogProps {
  onClose: () => void;
  /** Texte demandé au serveur, rendu avec les modèles de la boutique. */
  compose: ComposeRequest;
  contextType?: PreparedMessageContext;
  contextId?: string | null;
  customerId?: string | null;
  recipientPhone: string;
  WhatsAppIcon: React.ComponentType<{ size?: number }>;
}

/** Modèle modifiable dans Paramètres › Messages WhatsApp (la simple salutation ne l'est pas). */
const isEditable = (template: string): boolean => (MESSAGE_TEMPLATES as readonly string[]).includes(template);

/**
 * Message préparé, relu et modifiable : rien ne part sans le geste du commerçant. À monter à
 * l'ouverture (`{open && …}`) : le texte est recalculé à chaque fois.
 */
export function PreparedMessageDialog({
  onClose, compose, contextType = 'none', contextId = null, customerId = null, recipientPhone, WhatsAppIcon,
}: PreparedMessageDialogProps) {
  const t = useTranslations('messages.prepared');
  const textareaId = useId();
  const composed = useComposedMessage(compose);
  const [edited, setEdited] = useState<string | null>(null);
  const record = useCreatePreparedMessage({ onError: () => notify.error(t('record_failed')) });
  const isAdmin = useIsAdmin();
  const { can } = usePlanGating();
  const canEditTemplates = isAdmin && can('whatsapp');

  const message = edited ?? composed.data?.message ?? '';
  const template = composed.data?.template_type ?? compose.template ?? 'free';
  const phoneDigits = recipientPhone.replace(/\D/g, '');
  const canSend = phoneDigits.length > 0 && message.trim().length > 0;

  // WhatsApp s'ouvre dans le geste de l'utilisateur (après un await, le navigateur mobile bloque
  // la fenêtre) ; le message est enregistré en même temps, directement comme envoyé.
  function handleSend() {
    if (!canSend) return;
    window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    record.mutate({
      template_type: template, context_type: contextType, context_id: contextId,
      customer_id: customerId, custom_message: message, sent: true,
    });
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title={t('title')}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{t('hint', { name: recipientPhone || '—' })}</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={textareaId} className="text-xs font-medium text-muted-foreground">{t('message_label')}</label>
            {canEditTemplates && composed.data && isEditable(template) && (
              <Link href={`/settings/messages?template=${template}`}
                className="text-xs font-semibold text-primary underline-offset-4 hover:underline">
                {t('edit_template')}
              </Link>
            )}
          </div>
          {composed.isPending ? (
            <div className="h-48 animate-pulse rounded-2xl bg-muted" aria-busy />
          ) : (
            <textarea id={textareaId} value={message} onChange={(e) => setEdited(e.target.value)} rows={8} dir="auto"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none"
              autoComplete="off" autoCorrect="off" spellCheck={false} />
          )}
          {composed.isError && <p className="text-xs text-muted-foreground">{t('compose_failed')}</p>}
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <Button type="button" onClick={handleSend} disabled={!canSend} className="w-full h-12 rounded-full gap-2">
            <WhatsAppIcon size={16} />
            {t('send_cta')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="w-full h-11 rounded-full">{t('cancel')}</Button>
        </div>
      </div>
    </BottomSheet>
  );
}
