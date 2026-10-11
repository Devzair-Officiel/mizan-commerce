'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import {
  useCreatePreparedMessage,
  type PreparedMessageContext,
  type PreparedMessageTemplate,
} from '@/lib/hooks/usePreparedMessages';
import { notify } from '@/lib/notify';

interface PreparedMessageDialogProps {
  open: boolean;
  onClose: () => void;
  templateType: PreparedMessageTemplate;
  contextType?: PreparedMessageContext;
  contextId?: string | null;
  customerId?: string | null;
  recipientPhone: string;
  initialMessage: string;
  WhatsAppIcon: React.ComponentType<{ size?: number }>;
}

export function PreparedMessageDialog({
  open,
  onClose,
  templateType,
  contextType = 'none',
  contextId = null,
  customerId = null,
  recipientPhone,
  initialMessage,
  WhatsAppIcon,
}: PreparedMessageDialogProps) {
  const t = useTranslations('messages.prepared');
  const textareaId = useId();
  const [message, setMessage] = useState(initialMessage);
  const [lastOpen, setLastOpen] = useState(open);
  const record = useCreatePreparedMessage({ onError: () => notify.error(t('record_failed')) });

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setMessage(initialMessage);
  }

  const phoneDigits = recipientPhone.replace(/\D/g, '');
  const canSend = phoneDigits.length > 0 && message.trim().length > 0;

  // WhatsApp s'ouvre dans le geste de l'utilisateur (après un await, le navigateur mobile bloque
  // la fenêtre) ; le message est enregistré en même temps, directement comme envoyé.
  function handleSend() {
    if (!canSend) return;
    window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    record.mutate({
      template_type: templateType,
      context_type: contextType,
      context_id: contextId,
      customer_id: customerId,
      custom_message: message,
      sent: true,
    });
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          {t('hint', { name: recipientPhone || '—' })}
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={textareaId} className="text-xs font-medium text-muted-foreground">
            {t('message_label')}
          </label>
          <textarea
            id={textareaId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="w-full h-12 rounded-full gap-2"
          >
            <WhatsAppIcon size={16} />
            {t('send_cta')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="w-full h-11 rounded-full"
          >
            {t('cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
