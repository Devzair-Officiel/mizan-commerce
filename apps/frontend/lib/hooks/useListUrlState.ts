'use client';

import { useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Updates = Record<string, string | null>;

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Champ de recherche local, resynchronisé quand l'URL change d'ailleurs
 * (bouton retour, lien) — mais pas quand l'URL rattrape notre propre saisie,
 * sinon une lettre tapée pendant la navigation serait effacée.
 */
function useSearchInput(search: string) {
  const [searchInput, setSearchInput] = useState(search);
  const [prevSearch, setPrevSearch] = useState(search);
  const [committedSearch, setCommittedSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    if (search !== committedSearch) {
      setCommittedSearch(search);
      setSearchInput(search);
    }
  }
  return { searchInput, setSearchInput, setCommittedSearch };
}

/**
 * État d'une page de liste porté par l'URL : filtres, recherche, tri, page.
 *
 * Filtres, tri et page ajoutent une entrée d'historique (le bouton retour
 * restaure l'état précédent). La recherche remplace l'entrée courante après
 * une courte pause de frappe, pour ne pas empiler une entrée par lettre.
 */
export function useListUrlState(defaultOrdering: string) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const param = (key: string): string => searchParams.get(key) ?? '';
  const search = param('search');
  const page = Math.max(1, parseInt(param('page') || '1', 10) || 1);
  const ordering = param('ordering') || defaultOrdering;

  const { searchInput, setSearchInput, setCommittedSearch } = useSearchInput(search);

  const hrefWith = (updates: Updates, base: URLSearchParams = searchParams): string => {
    const params = new URLSearchParams(base.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const cancelPendingSearch = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  const push = (href: string) => {
    cancelPendingSearch();
    router.push(href, { scroll: false });
  };

  return {
    param,
    page,
    ordering,
    search,
    searchInput,
    setSearch(value: string) {
      setSearchInput(value);
      cancelPendingSearch();
      timer.current = setTimeout(() => {
        const next = value.trim() ? value : '';
        setCommittedSearch(next);
        router.replace(hrefWith({ search: next || null, page: null }), { scroll: false });
      }, SEARCH_DEBOUNCE_MS);
    },
    /** Change un ou plusieurs filtres et revient à la première page. */
    setParams: (updates: Updates) => push(hrefWith({ ...updates, page: null })),
    setPage: (next: number) => push(hrefWith({ page: next > 1 ? String(next) : null })),
    setOrdering: (next: string) =>
      push(hrefWith({ ordering: next === defaultOrdering ? null : next, page: null })),
    /** Retire filtres et recherche, garde le tri choisi. */
    clearFilters() {
      setSearchInput('');
      setCommittedSearch('');
      const kept = new URLSearchParams();
      if (param('ordering')) kept.set('ordering', param('ordering'));
      push(hrefWith({}, kept));
    },
  };
}
