import { useMemo } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/** Liste d'une fiche : 5 éléments, puis 10 de plus à chaque « Voir plus » (design_principles §4). */
export const SHOW_MORE_FIRST = 5;
export const SHOW_MORE_STEP = 10;

interface WindowPage<T> {
  count: number;
  results: T[];
}

export interface ShowMoreQuery<T> {
  items: T[];
  /** Nombre total d'éléments côté serveur. */
  count: number;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  loadMore: () => void;
}

/**
 * Liste paginée par fenêtre (`limit`, `offset`) : le serveur ne renvoie jamais tout l'historique.
 * `params` : filtres de l'endpoint, sans `limit` ni `offset` ; `queryKey` doit les refléter.
 */
export function useShowMoreQuery<T extends { id: string }>(
  queryKey: QueryKey,
  path: string,
  params: Record<string, string | undefined>,
  enabled = true,
): ShowMoreQuery<T> {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
      search.set('limit', String(pageParam === 0 ? SHOW_MORE_FIRST : SHOW_MORE_STEP));
      search.set('offset', String(pageParam));
      return apiFetch<WindowPage<T>>(`${path}?${search}`);
    },
    initialPageParam: 0,
    // Offset suivant = éléments déjà chargés : recalculé à chaque rafraîchissement des pages.
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.results.length, 0);
      return last.results.length > 0 && loaded < last.count ? loaded : undefined;
    },
    enabled,
  });
  const pages = query.data?.pages;
  // Un élément ajouté entre deux chargements décale les fenêtres : on ne garde que sa première occurrence.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (pages ?? []).flatMap((page) => page.results).filter((item) => !seen.has(item.id) && !!seen.add(item.id));
  }, [pages]);

  return {
    items,
    count: pages?.at(-1)?.count ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadMore: () => { void query.fetchNextPage(); },
  };
}
