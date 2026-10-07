'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bell, Check } from 'lucide-react';
import { useMarkReminderDone } from '@/lib/hooks/useReminders';
import { useFormat } from '@/lib/hooks/useFormat';
import type { ReminderSummary } from '@/lib/hooks/useDashboard';

interface Props { count: number; items: ReminderSummary[]; }

export function TodayRemindersList({ count, items }: Props) {
  const t = useTranslations('dashboard.reminders');
  const fmt = useFormat();
  const markDone = useMarkReminderDone();

  if (count === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Bell size={20} className="text-muted-foreground" />
        </span>
        <p className="text-sm font-semibold text-foreground">{t('empty')}</p>
        <p className="text-xs text-muted-foreground">{t('empty_sub')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">{t('title')}</p>
        <span className="rounded-full bg-muted text-foreground text-xs font-semibold px-2 py-0.5">{count}</span>
      </div>
      <div className="divide-y divide-border">
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <Link href="/reminders" className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
              <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {r.is_overdue && (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('overdue')}</span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmt.dateTime(r.due_at, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </Link>
            <button
              onClick={() => markDone.mutate(r.id)}
              disabled={markDone.isPending}
              aria-label={t('mark_done_aria')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card hover:bg-green-50 dark:hover:bg-green-950/20 hover:border-green-300 dark:hover:border-green-800 hover:text-green-600 dark:hover:text-green-400 transition-colors active:scale-95 disabled:opacity-50"
            >
              <Check size={15} />
            </button>
          </div>
        ))}
      </div>
      <Link href="/reminders"
        className="block text-center text-xs font-medium text-primary px-4 py-3 hover:bg-muted transition-colors border-t border-border">
        {t('see_all')}
      </Link>
    </div>
  );
}
