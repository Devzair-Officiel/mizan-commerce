'use client';

import { useTranslations } from 'next-intl';
import { Menu } from '@base-ui/react/menu';
import { Clock } from 'lucide-react';
import { POSTPONE_OPTIONS, type PostponeKey } from './useReminderActions';

/** « Reporter » sur desktop : dans 1 h, demain 9 h, lundi 9 h, choisir une date. */
export function ReminderPostponeMenu({ title, onSelect }: { title: string; onSelect: (key: PostponeKey) => void }) {
  const t = useTranslations('reminders.list');
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t('postpone_aria', { title })}
        className="inline-flex h-8.5 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted"
      >
        <Clock size={16} aria-hidden />
        {t('postpone')}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Menu.Popup aria-label={t('postpone')} className="w-56 rounded-2xl border border-border bg-card p-1.5 shadow-lg outline-none">
            {POSTPONE_OPTIONS.map((o) => (
              <Menu.Item key={o.key} onClick={() => onSelect(o.key)}
                className="flex h-10 cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-foreground outline-none data-highlighted:bg-muted">
                {t(`postpone_option.${o.key}`)}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
