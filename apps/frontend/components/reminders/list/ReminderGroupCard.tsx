import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ReminderGroupCardProps {
  title: string;
  count: number;
  /** Pastille de l'en-tête : rouge (en retard), ambre (aujourd'hui). */
  dot?: 'red' | 'amber';
  children: ReactNode;
}

const DOT = { red: 'bg-red-600 dark:bg-red-400', amber: 'bg-amber-600 dark:bg-amber-400' };

/** Un groupe de la liste (« En retard », « Demain »…) : carte à en-tête teinté. */
export function ReminderGroupCard({ title, count, dot, children }: ReminderGroupCardProps) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="header-band flex items-center gap-2 border-b border-border px-4.5 py-3">
        {dot && <span aria-hidden className={cn('size-2 rounded-full', DOT[dot])} />}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-[0.8125rem] text-muted-foreground tabular-nums">{count}</span>
      </div>
      {children}
    </section>
  );
}
