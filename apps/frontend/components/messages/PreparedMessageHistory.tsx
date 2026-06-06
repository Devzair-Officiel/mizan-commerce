'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, MessageCircle, Trash2 } from 'lucide-react';
import {
  useDeletePreparedMessage,
  usePreparedMessages,
  type PreparedMessage,
  type PreparedMessageStatus,
} from '@/lib/hooks/usePreparedMessages';
import { useFormatDateTime } from '@/lib/hooks/useFormat';

interface PreparedMessageHistoryProps {
  customerId?: string;
  orderId?: string;
}

const STATUS_CLASSES: Record<PreparedMessageStatus, string> = {
  prepared: 'bg-amber-400/10 text-amber-700 dark:text-amber-300',
  sent_manually: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  archived: 'bg-muted text-muted-foreground',
};

export function PreparedMessageHistory({ customerId, orderId }: PreparedMessageHistoryProps) {
  const t = useTranslations('messages.history');
  const formatDateTime = useFormatDateTime();
  const { data, isLoading } = usePreparedMessages({ customerId, orderId });
  const messages = data?.results ?? [];

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
}

function MessageRow({ message, formatDateTime }: MessageRowProps) {
  const t = useTranslations('messages.history');
  const [expanded, setExpanded] = useState(false);
  const del = useDeletePreparedMessage(message.id);

  const timestamp = message.sent_manually_at ?? message.created_at;
  const isPrepared = message.status === 'prepared';

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t('delete_confirm'))) return;
    await del.mutateAsync();
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full px-4 py-3 text-left active:bg-muted/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[message.status]}`}
          >
            {message.status === 'sent_manually' && <CheckCircle2 size={11} />}
            {message.status_display}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {formatDateTime(timestamp, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {isPrepared && (
          <span
            role="button"
            tabIndex={0}
            aria-label={t('delete_aria')}
            onClick={handleDelete}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleDelete(e as unknown as React.MouseEvent);
              }
            }}
            className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-destructive active:scale-95 transition-transform cursor-pointer"
          >
            <Trash2 size={14} />
          </span>
        )}
      </div>
      <p
        className={`mt-1.5 text-sm text-foreground whitespace-pre-wrap break-words ${expanded ? '' : 'line-clamp-2'}`}
      >
        {message.message}
      </p>
    </button>
  );
}
