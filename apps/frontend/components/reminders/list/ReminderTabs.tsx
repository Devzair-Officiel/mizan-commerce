'use client';

import { useTranslations } from 'next-intl';
import type { ReminderSummary } from '@/lib/hooks/useReminders';
import type { ReminderScope } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { TABS } from './useRemindersPageState';

const COUNT: Record<ReminderScope, keyof ReminderSummary> = { todo: 'todo', upcoming: 'upcoming', done: 'done' };

interface ReminderTabsProps {
  value: ReminderScope;
  onChange: (tab: ReminderScope) => void;
  summary?: ReminderSummary;
  className?: string;
}

/** Onglets À faire / À venir / Terminés, avec le nombre de rappels de chacun (filtres compris). */
export function ReminderTabs({ value, onChange, summary, className }: ReminderTabsProps) {
  const t = useTranslations('reminders.list');
  return (
    <div role="tablist" aria-label={t('tabs_label')} className={cn('flex gap-1 rounded-xl bg-muted p-1', className)}>
      {TABS.map((tab) => {
        const selected = tab === value;
        return (
          <button key={tab} type="button" role="tab" aria-selected={selected} onClick={() => onChange(tab)}
            className={cn(
              'flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-none',
              selected ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
            )}>
            {t(`tab.${tab}`)}
            {summary && <span className="font-medium tabular-nums text-muted-foreground">{summary[COUNT[tab]]}</span>}
          </button>
        );
      })}
    </div>
  );
}
