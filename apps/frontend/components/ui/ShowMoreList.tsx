'use client';

import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ShowMoreQuery } from '@/lib/hooks/useShowMoreQuery';

/** Nature des éléments : accord de « restant(e)s » selon la langue. */
export type ShowMoreKind = 'activities' | 'events' | 'orders' | 'movements' | 'messages' | 'notes' | 'reminders';

interface ShowMoreListProps {
  list: Pick<ShowMoreQuery<unknown>, 'count' | 'hasMore' | 'isFetchingMore' | 'loadMore'> & { items: readonly unknown[] };
  kind: ShowMoreKind;
  /** La liste déjà rendue (lignes, tableau). */
  children: ReactNode;
}

/** Liste d'une fiche (design_principles §4) : la liste, puis « Voir plus (N restantes) » tant qu'il en reste. */
export function ShowMoreList({ list, kind, children }: ShowMoreListProps) {
  const t = useTranslations('ui.show_more');
  const remaining = Math.max(list.count - list.items.length, 0);
  return (
    <>
      {children}
      {list.hasMore && remaining > 0 && (
        <button type="button" onClick={list.loadMore} disabled={list.isFetchingMore} aria-busy={list.isFetchingMore}
          className="block w-full border-t border-border px-4 py-3 text-[0.8125rem] font-semibold text-primary transition-colors hover:bg-muted/50 active:bg-muted disabled:cursor-wait disabled:opacity-60">
          {t('more', { kind, remaining })}
        </button>
      )}
    </>
  );
}
