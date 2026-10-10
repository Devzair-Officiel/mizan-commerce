'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, MessageCircle, Trash2 } from 'lucide-react';
import {
  useDeletePreparedMessage,
  usePreparedMessages,
  type PreparedMessage,
  type PreparedMessageStatus,
} from '@/lib/hooks/usePreparedMessages';
import { useFormatDateTime } from '@/lib/hooks/useFormat';
import { ConfirmDialog } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/SectionCard';

interface PreparedMessageHistoryProps {
  customerId?: string;
  orderId?: string;
  /** Version carte de section (détail d'une commande) : titre en casse normale, aperçu sur une ligne. */
  compact?: boolean;
}

const STATUS_CLASSES: Record<PreparedMessageStatus, string> = {
  prepared: 'bg-amber-400/10 text-amber-700 dark:text-amber-300',
  sent_manually: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  archived: 'bg-muted text-muted-foreground',
};

export function PreparedMessageHistory({ customerId, orderId, compact }: PreparedMessageHistoryProps) {
  const t = useTranslations('messages.history');
  const formatDateTime = useFormatDateTime();
  const { data, isLoading } = usePreparedMessages({ customerId, orderId });
  const messages = data?.results ?? [];

  if (compact) {
    if (messages.length === 0) return null;
    return (
      <SectionCard title={t('title')} rightSlot={<span className="text-muted-foreground tabular-nums">{messages.length}</span>}>
        <div className="divide-y divide-border">
          {messages.map((msg) => (
            <MessageRow key={msg.id} message={msg} formatDateTime={formatDateTime} compact />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <MessageCircle size={15} className="text-muted-foreground" />
          <h2 className="font-semibold text-sm text-foreground">{t('title')}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {messages.length}
          </span>
        </div>
      </div>

      <div className="border-t border-border divide-y divide-border">
        {messages.map((msg) => (
          <MessageRow key={msg.id} message={msg} formatDateTime={formatDateTime} />
        ))}
      </div>
    </div>
  );
}

interface MessageRowProps {
  message: PreparedMessage;
  formatDateTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  compact?: boolean;
}

function MessageRow({ message, formatDateTime, compact }: MessageRowProps) {
  const t = useTranslations('messages.history');
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useDeletePreparedMessage(message.id);
  const contentId = useId();

  const timestamp = message.sent_manually_at ?? message.created_at;
  const isPrepared = message.status === 'prepared';
  const padding = compact ? 'px-4 lg:px-5' : 'px-4';

  // Le dépliage et la suppression sont deux boutons voisins : un bouton ne peut pas en contenir un autre.
  return (
    <div>
      <div className={`flex items-center gap-1 ${padding}`}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 py-3 text-start transition-colors active:opacity-70"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[message.status]}`}>
              {message.status === 'sent_manually' && <CheckCircle2 size={11} aria-hidden />}
              {message.status_display}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {formatDateTime(timestamp, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
          {!expanded && (
            <span className={`mt-1.5 block text-sm text-foreground wrap-break-word ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>
              {message.message}
            </span>
          )}
        </button>
        {isPrepared && (
          <button
            type="button"
            aria-label={t('delete_aria')}
            onClick={() => setConfirmDelete(true)}
            className="-me-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform hover:text-destructive active:scale-95"
          >
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>
      <p id={contentId} hidden={!expanded} className={`${padding} pb-3 text-sm text-foreground whitespace-pre-wrap wrap-break-word`}>
        {message.message}
      </p>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('delete_confirm')}
        onConfirm={() => del.mutateAsync()}
        variant="destructive"
        confirmLabel={t('delete_cta')}
      />
    </div>
  );
}
