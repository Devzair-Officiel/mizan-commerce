'use client';

import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Reminder } from '@/lib/hooks/useReminders';
import { POSTPONE_OPTIONS, type PostponeKey } from './useReminderActions';

interface ReminderPostponeSheetProps {
  reminder: Reminder;
  onClose: () => void;
  onSelect: (reminder: Reminder, key: PostponeKey) => void;
}

/** « Reporter » sur mobile, ouvert depuis le menu « ⋯ » d'une ligne. */
export function ReminderPostponeSheet({ reminder, onClose, onSelect }: ReminderPostponeSheetProps) {
  const t = useTranslations('reminders.list');
  return (
    <BottomSheet open onClose={onClose} title={t('postpone')} description={reminder.title}>
      <div className="flex flex-col px-2 pb-4">
        {POSTPONE_OPTIONS.map((o) => (
          <button key={o.key} type="button" onClick={() => { onClose(); onSelect(reminder, o.key); }}
            className="flex h-12 w-full items-center rounded-xl px-3 text-start text-[0.9375rem] font-medium text-foreground active:bg-muted">
            {t(`postpone_option.${o.key}`)}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
