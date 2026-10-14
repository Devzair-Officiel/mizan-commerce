'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import type { DetailMenuActions } from '@/components/detail/types';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useDeleteReminder, useMarkReminderDone, useReopenReminder, type Reminder } from '@/lib/hooks/useReminders';
import { notify } from '@/lib/notify';

/** « ⋯ » de la modification d'un rappel : terminer ou rouvrir, supprimer (avec confirmation). */
export function ReminderEditMenu({ reminder: r, onDeleted }: { reminder: Reminder; onDeleted: () => void }) {
  const t = useTranslations('reminders.list');
  const markDone = useMarkReminderDone();
  const reopen = useReopenReminder();
  const remove = useDeleteReminder();
  const [confirming, setConfirming] = useState(false);
  const failed = () => notify.error(t('action_failed'));
  const done = r.status === 'done';

  const actions: DetailMenuActions = {
    items: [done
      ? { key: 'reopen', label: t('reopen'), icon: RotateCcw, onSelect: () => reopen.mutate(r.id, { onSuccess: () => notify.success(t('reopened_toast')), onError: failed }) }
      : { key: 'done', label: t('mark_done'), icon: CheckCircle2, onSelect: () => markDone.mutate(r.id, { onSuccess: () => notify.success(t('done_toast', { title: r.title })), onError: failed }) }],
    danger: { key: 'delete', label: t('delete'), icon: Trash2, destructive: true, onSelect: () => setConfirming(true) },
  };

  return (
    <>
      <div className="lg:hidden"><DetailActionsMenu actions={actions} variant="sheet" /></div>
      <div className="hidden lg:block"><DetailActionsMenu actions={actions} variant="menu" /></div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('delete_confirm', { title: r.title })}
        description={r.is_automatic ? t('delete_automatic_hint') : undefined}
        onConfirm={async () => {
          // Message générique dans la fenêtre : jamais le détail de l'erreur serveur.
          await remove.mutateAsync(r.id).catch(() => { throw new Error(t('action_failed')); });
          notify.success(t('deleted_toast'));
          onDeleted();
        }}
        variant="destructive"
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
      />
    </>
  );
}
