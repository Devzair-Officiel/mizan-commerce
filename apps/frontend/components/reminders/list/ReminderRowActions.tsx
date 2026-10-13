'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock, MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { DetailActionsMenu } from '@/components/detail/DetailActionsMenu';
import type { DetailAction } from '@/components/detail/types';
import type { Reminder } from '@/lib/hooks/useReminders';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { ReminderPostponeMenu } from './ReminderPostponeMenu';
import { canFollowUp, type ReminderActions } from './useReminderActions';

const BUTTON = 'inline-flex h-8.5 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Desktop : « Relancer », « Reporter » et « ⋯ » (Modifier, Supprimer).
 * Mobile : tout passe par « ⋯ » ; « Reporter » y ouvre une seconde feuille.
 */
export function ReminderRowActions({ reminder: r, actions }: { reminder: Reminder; actions: ReminderActions }) {
  const t = useTranslations('reminders.list');
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const pending = r.status === 'pending';
  const followUp = canFollowUp(r);

  const edit: DetailAction = { key: 'edit', label: t('edit'), icon: Pencil, onSelect: () => router.push(`/reminders/${r.id}/edit`) };
  const remove: DetailAction = { key: 'delete', label: t('delete'), icon: Trash2, destructive: true, onSelect: () => actions.askDelete(r) };
  const mobileItems: DetailAction[] = [
    ...(followUp ? [{ key: 'follow_up', label: t('follow_up'), icon: MessageCircle, onSelect: () => actions.openFollowUp(r) }] : []),
    ...(pending ? [{ key: 'postpone', label: t('postpone'), icon: Clock, onSelect: () => actions.openPostponeSheet(r) }] : []),
    edit,
  ];
  const label = t('more_aria', { title: r.title });

  if (isDesktop === false) {
    return <DetailActionsMenu variant="sheet" compact label={label} actions={{ items: mobileItems, danger: remove }} />;
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {followUp && (
        <button type="button" onClick={() => actions.openFollowUp(r)} aria-label={t('follow_up_aria', { title: r.title })} className={BUTTON}>
          <MessageCircle size={16} aria-hidden />
          {t('follow_up')}
        </button>
      )}
      {pending && <ReminderPostponeMenu title={r.title} onSelect={(key) => actions.postpone(r, key)} />}
      <DetailActionsMenu variant="menu" compact label={label} actions={{ items: [edit], danger: remove }} />
    </div>
  );
}
