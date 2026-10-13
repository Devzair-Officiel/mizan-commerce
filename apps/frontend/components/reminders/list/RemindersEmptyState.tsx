'use client';

import { useTranslations } from 'next-intl';
import { BellRing } from 'lucide-react';
import type { ReminderScope } from '@/lib/query-keys';

/** Onglet vide : message de l'onglet, ou « aucun résultat » avec « Effacer les filtres ». */
export function RemindersEmptyState({ tab, filtered, onClear }: { tab: ReminderScope; filtered: boolean; onClear: () => void }) {
  const t = useTranslations('reminders.list');
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <BellRing size={20} className="text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-foreground">{t(filtered ? 'empty_filtered' : `empty.${tab}`)}</p>
      {filtered && (
        <button type="button" onClick={onClear} className="text-xs font-medium text-primary">{t('clear_filters')}</button>
      )}
    </div>
  );
}
