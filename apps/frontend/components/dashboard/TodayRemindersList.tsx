'use client';

import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { useMarkReminderDone } from '@/lib/hooks/useReminders';
import { useFormat } from '@/lib/hooks/useFormat';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import type { ReminderSummary } from '@/lib/hooks/useDashboard';

interface Props { count: number; items: ReminderSummary[]; }

type TRem = ReturnType<typeof useTranslations<'dashboard.reminders'>>;

function useReminderSubtext(t: TRem, fmt: ReturnType<typeof useFormat>) {
  return (r: ReminderSummary): { text: string; amber: boolean } => {
    const timeStr = fmt.dateTime(r.due_at, { hour: '2-digit', minute: '2-digit' });
    if (!r.is_overdue) return { text: timeStr, amber: false };
    const dueDate = new Date(r.due_at);
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dueDayMs = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
    let prefix = '';
    if (dueDayMs === todayMs - 86_400_000) prefix = `${t('date_yesterday')}, `;
    else if (dueDayMs < todayMs - 86_400_000) {
      prefix = `${fmt.date(r.due_at, { day: 'numeric', month: 'short' })}, `;
    }
    return { text: `${t('overdue_label')}, ${prefix}${timeStr}`, amber: true };
  };
}

export function TodayRemindersList({ count, items }: Props) {
  const t = useTranslations('dashboard.reminders');
  const fmt = useFormat();
  const markDone = useMarkReminderDone();
  const reminderSubtext = useReminderSubtext(t, fmt);

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
    <DashboardCard title={t('title')} rightLink={{ label: t('see_all'), href: '/reminders' }}>
      <div className="divide-y divide-border">
        {items.map((r) => {
          const sub = reminderSubtext(r);
          return (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                <p className={`text-[0.8125rem] mt-0.5 tabular-nums ${sub.amber ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                  {sub.text}
                </p>
              </div>
              <button
                type="button"
                onClick={() => markDone.mutate(r.id)}
                disabled={markDone.isPending}
                aria-label={t('mark_done_aria')}
                className="h-9 w-9 shrink-0 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors active:scale-95 disabled:opacity-50"
              >
                <div className="h-5 w-5 rounded-full border border-muted-foreground/40" />
              </button>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}
