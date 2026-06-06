'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import {
  useCreatePreparedMessage,
  useMarkMessageSent,
  type PreparedMessage,
  type PreparedMessageContext,
  type PreparedMessageTemplate,
} from '@/lib/hooks/usePreparedMessages';

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
  const create = useCreatePreparedMessage();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const markSent = useMarkMessageSent(pendingId ?? '');

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setMessage(initialMessage);
      setPendingId(null);
    }
  }

  const phoneDigits = recipientPhone.replace(/\D/g, '');
  const canSend = phoneDigits.length > 0 && message.trim().length > 0;
  const isSubmitting = create.isPending || markSent.isPending;

  async function handleSend() {
    if (!canSend || isSubmitting) return;
    try {
      const created: PreparedMessage = await create.mutateAsync({
        template_type: templateType,
        context_type: contextType,
        context_id: contextId,
        customer_id: customerId,
        custom_message: message,
      });
      setPendingId(created.id);
      // mark-sent en background — on n'attend pas la réponse pour ouvrir WhatsApp
      fetch(`/api/proxy/messages/prepared/${created.id}/mark-sent/`, { method: 'POST' });
      window.open(
        `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`,
        '_blank',
        'noopener,noreferrer',
      );
      onClose();
    } catch {
      // l'erreur reste affichée via create.error
    }
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

        {create.error && (
          <p className="text-xs text-destructive" role="alert">
            {t('error_generic')}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="button"
            onClick={handleSend}
            disabled={!canSend || isSubmitting}
            className="w-full h-12 rounded-full gap-2"
          >
            <WhatsAppIcon size={16} />
            {isSubmitting ? t('sending') : t('send_cta')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full h-11 rounded-full"
          >
            {t('cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
