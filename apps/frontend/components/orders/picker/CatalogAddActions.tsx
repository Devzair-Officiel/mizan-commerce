'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { PenLine, Plus } from 'lucide-react';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';

const BUTTON = 'inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted active:bg-muted transition-colors';

/** « Créer un article » et « Article ponctuel », sous la recherche du catalogue (grand écran et mobile). */
export function CatalogAddActions({ onCreate, onFreeLine }: { onCreate: () => void; onFreeLine: () => void }) {
  const t = useTranslations('orders.picker');
  const kind = useCatalogKind();
  const helpId = useId();

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onCreate} className={BUTTON}>
        <Plus size={16} className="shrink-0 text-primary" aria-hidden />{t('panel_create', { kind })}
      </button>
      <button type="button" onClick={onFreeLine} title={t('free_line_help')} aria-describedby={helpId} className={BUTTON}>
        <PenLine size={15} className="shrink-0 text-primary" aria-hidden />{t('free_line_button', { kind })}
      </button>
      <span id={helpId} className="sr-only">{t('free_line_help')}</span>
    </div>
  );
}
