'use client';

import { useTranslations } from 'next-intl';
import { useFormatDate } from '@/lib/hooks/useFormat';
import { useReminders, type Reminder } from '@/lib/hooks/useReminders';
import type { ReminderScope } from '@/lib/query-keys';

const DUE_OPTIONS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
const EMPTY = { todo: 'empty_todo', upcoming: 'empty_upcoming', done: 'empty_done' } as const;

/** Rappels d'un onglet ; un clic ouvre le rappel. */
export function ReminderList({ scope, onOpen }: { scope: ReminderScope; onOpen: (reminder: Reminder) => void }) {
  const t = useTranslations('reminders');
  const formatDate = useFormatDate();
  const { data, isLoading } = useReminders(scope);
  const done = scope === 'done';

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="h-4 bg-muted animate-pulse rounded-md mb-2" />
            <div className="h-3 bg-muted animate-pulse rounded-md w-1/3" />
          </div>
        ))}
      </div>
    );
  }
  if (!data?.results.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">{t(EMPTY[scope])}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {data.results.map((r) => (
        <button key={r.id} type="button" onClick={() => onOpen(r)}
          className={`w-full text-start flex items-start justify-between gap-3 px-4 py-3.5 rounded-2xl border border-border bg-card hover:bg-muted active:bg-muted transition-colors ${done ? 'opacity-60' : ''}`}>
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <p className={`text-sm font-medium text-foreground truncate ${done ? 'line-through' : ''}`}>{r.title}</p>
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{t('category', { value: r.category })}</span>
              <span className="tabular-nums">{formatDate(r.due_at, DUE_OPTIONS)}</span>
            </p>
            {r.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>}
          </div>
          <span className="text-muted-foreground text-lg shrink-0 rtl:rotate-180">›</span>
        </button>
      ))}
    </div>
  );
}
