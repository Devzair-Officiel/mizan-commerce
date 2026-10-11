'use client';

import { useTranslations } from 'next-intl';
import { useReminders } from '@/lib/hooks/useReminders';
import type { ReminderScope } from '@/lib/query-keys';

const SCOPES: { scope: ReminderScope; label: 'tab_todo' | 'tab_upcoming' | 'tab_done' }[] = [
  { scope: 'todo', label: 'tab_todo' },
  { scope: 'upcoming', label: 'tab_upcoming' },
  { scope: 'done', label: 'tab_done' },
];

function Tab({ scope, label, active, onSelect }: { scope: ReminderScope; label: (typeof SCOPES)[number]['label']; active: boolean; onSelect: () => void }) {
  const t = useTranslations('reminders');
  // Même requête que la liste de l'onglet : « À faire » donne le chiffre du badge et de l'accueil.
  const { data } = useReminders(scope);
  return (
    <button type="button" onClick={onSelect} aria-pressed={active}
      className={`flex-1 py-2.5 transition-colors not-first:border-s not-first:border-border ${active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
      {t(label, { count: data?.count ?? 0 })}
    </button>
  );
}

/** Onglets de la page Rappels, avec le nombre de rappels de chacun. */
export function ReminderTabs({ value, onChange }: { value: ReminderScope; onChange: (scope: ReminderScope) => void }) {
  return (
    <div className="flex rounded-xl border border-border overflow-hidden text-sm font-medium">
      {SCOPES.map(({ scope, label }) => (
        <Tab key={scope} scope={scope} label={label} active={value === scope} onSelect={() => onChange(scope)} />
      ))}
    </div>
  );
}
