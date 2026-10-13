'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchStockLevels, useStockLevels, type StockLevel } from '@/lib/hooks/useStock';
import { qk } from '@/lib/query-keys';

const PAGE_SIZE = 8;
const DEBOUNCE_MS = 250;

/** Code-barres ou référence identique à la saisie (douchette), sinon le seul résultat. */
function exactMatch(results: StockLevel[], search: string): StockLevel | undefined {
  const q = search.toLowerCase();
  return results.find((l) => l.barcode.toLowerCase() === q || l.sku.toLowerCase() === q)
    ?? (results.length === 1 ? results[0] : undefined);
}

/**
 * Recherche d'un format suivi : nom, format, référence ou code-barres. Entrée choisit le
 * résultat actif ; une douchette tape le code-barres puis Entrée sans attendre le délai de
 * recherche : la lecture est alors directe et le format identique est ajouté.
 */
export function useStockVariantSearch(onPick: (level: StockLevel) => void) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const { data, isFetching } = useStockLevels({ search: debounced, pageSize: PAGE_SIZE }, { enabled: debounced !== '' });
  const results = debounced !== '' ? data?.results ?? [] : [];
  const expanded = open && debounced !== '' && query.trim() !== '' && (results.length > 0 || !isFetching);

  function pick(level: StockLevel) {
    onPick(level);
    setQuery('');
    setDebounced('');
    setActive(0);
  }

  async function submit() {
    const search = query.trim();
    if (!search) return;
    const current = results[active];
    if (search === debounced && current) return pick(current);
    const filters = { search, pageSize: PAGE_SIZE };
    const page = await qc.fetchQuery({ queryKey: qk.stock.levels(filters), queryFn: () => fetchStockLevels(filters) });
    const match = exactMatch(page.results, search);
    if (match) pick(match);
    else { setDebounced(search); setOpen(true); }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); }
    else if (e.key === 'Escape' && expanded) { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
    }
  }

  return {
    query, results, active, expanded, loading: isFetching, onKeyDown, pick,
    change(value: string) { setQuery(value); setOpen(true); setActive(0); },
    close: () => setOpen(false),
    reopen: () => setOpen(true),
  };
}
