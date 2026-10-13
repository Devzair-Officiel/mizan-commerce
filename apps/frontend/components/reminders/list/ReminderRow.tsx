'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, Sparkles } from 'lucide-react';
import type { Reminder } from '@/lib/hooks/useReminders';
import { cn } from '@/lib/utils';
import { ReminderRowActions } from './ReminderRowActions';
import { ReminderRowMeta } from './ReminderRowMeta';
import type { ReminderActions } from './useReminderActions';

const CHIP = 'inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[0.6875rem] font-semibold';

interface ReminderRowProps {
  reminder: Reminder;
  currency: string;
  actions: ReminderActions;
}

/** Une ligne : case ronde (terminer ou rouvrir), titre et étiquettes, infos, actions. */
export function ReminderRow({ reminder: r, currency, actions }: ReminderRowProps) {
  const t = useTranslations('reminders.list');
  const tCategory = useTranslations('reminders');
  const done = r.status === 'done';

  return (
    <li className="flex items-center gap-3.5 border-t border-border px-4.5 py-3.5 first:border-t-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t(done ? 'reopen_aria' : 'done_aria', { title: r.title })}
        onClick={() => actions.toggleDone(r)}
        className={cn(
          'grid size-6.5 shrink-0 place-items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          done ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-primary',
        )}
      >
        {done && <Check size={14} strokeWidth={3} aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/reminders/${r.id}/edit`}
            className={cn('text-[0.9375rem] font-semibold underline-offset-4 hover:underline', done ? 'text-muted-foreground line-through' : 'text-foreground')}>
            {r.title}
          </Link>
          <span className={cn(CHIP, 'bg-muted text-muted-foreground')}>{tCategory('category', { value: r.category })}</span>
          {r.is_automatic && (
            <span className={cn(CHIP, 'bg-secondary text-secondary-foreground')}>
              <Sparkles size={11} aria-hidden />
              {t('automatic')}
            </span>
          )}
        </div>
        <ReminderRowMeta reminder={r} currency={currency} />
      </div>
      <ReminderRowActions reminder={r} actions={actions} />
    </li>
  );
}
