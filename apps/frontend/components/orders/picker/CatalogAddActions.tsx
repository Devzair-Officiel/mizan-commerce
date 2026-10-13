'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { PenLine, Plus } from 'lucide-react';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';

/**
 * Côte à côte quand les deux tiennent ; sinon chacun passe sur sa ligne et prend toute
 * la largeur (sous lg). Le libellé n'est jamais coupé : il revient à la ligne en dernier recours.
 */
const BUTTON = 'inline-flex grow lg:grow-0 items-center justify-center gap-2 min-h-10 py-2 px-4 rounded-full border border-border bg-card text-sm font-semibold text-center text-foreground hover:bg-muted active:bg-muted transition-colors';

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
