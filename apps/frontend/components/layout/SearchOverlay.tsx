'use client';

import {
  useState, useEffect, useRef, useId, createContext, useContext, useCallback,
  type RefObject, type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSearch } from '@/lib/hooks/useSearch';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { SearchInput } from './search/SearchInput';
import { SearchPanel } from './search/SearchPanel';

/* ── Context ──────────────────────────────────────────────────────────────── */

interface SearchContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearchOverlay() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearchOverlay must be used inside SearchProvider');
  return ctx;
}

/* ── Keyboard navigation hook ─────────────────────────────────────────────── */

function useSearchKeyNav(items: string[]) {
  const itemsKey = items.join(',');
  // Track active index alongside the items key it was computed for.
  // When the key changes, the index is stale — treat it as null.
  const [nav, setNav] = useState<{ key: string; idx: number | null }>({ key: '', idx: null });
  const activeIdx = nav.key === itemsKey ? nav.idx : null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setNav({ key: itemsKey, idx: activeIdx === null ? 0 : Math.min(activeIdx + 1, items.length - 1) });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setNav({ key: itemsKey, idx: activeIdx === null ? items.length - 1 : Math.max(activeIdx - 1, 0) });
    }
  }

  const activeId = activeIdx !== null ? items[activeIdx] ?? null : null;
  return { activeId, onKeyDown };
}

/* ── Mobile overlay ───────────────────────────────────────────────────────── */

function MobileSearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const listId = useId();
  const { data, isFetching } = useSearch(q);

  useEffect(() => {
    history.pushState({ searchOverlay: true }, '');
    const handler = (e: PopStateEvent) => {
      if (!(e.state as { searchOverlay?: boolean } | null)?.searchOverlay) onClose();
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const allIds = buildAllIds(q, data);
  const { activeId, onKeyDown } = useSearchKeyNav(allIds);

  function navigate(href: string) { onClose(); router.push(href); }
  function handleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown(e);
    if (e.key === 'Enter' && activeId) {
      const href = resolveIdHref(activeId, q, data);
      if (href) navigate(href);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-border">
        <SearchInput value={q} onChange={setQ} onClose={onClose}
          listId={listId} activeId={activeId} onKeyDown={handleEnter}
          autoFocus showCancel
          className="h-12 rounded-full bg-muted px-4"
          inputClassName="text-base" />
      </div>
      <div className="flex-1 overflow-y-auto" aria-live="polite" aria-busy={isFetching}>
        <SearchPanel q={q} data={data} isFetching={isFetching}
          activeId={activeId} listId={listId} onNavigate={navigate} />
      </div>
    </div>
  );
}

/* ── Desktop popover ──────────────────────────────────────────────────────── */

export function DesktopSearchPopover({ onClose, anchorRef }: { onClose: () => void; anchorRef: RefObject<HTMLElement | null> }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { data, isFetching } = useSearch(q);
  const allIds = buildAllIds(q, data);
  const { activeId, onKeyDown } = useSearchKeyNav(allIds);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      if (!anchor.contains(e.target as Node) && !panel.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function navigate(href: string) { onClose(); router.push(href); }
  function handleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown(e);
    if (e.key === 'Enter' && activeId) {
      const href = resolveIdHref(activeId, q, data);
      if (href) navigate(href);
    }
  }

  return (
    <div ref={panelRef} className="absolute inset-e-0 top-full mt-1 w-xl max-w-[calc(100vw-2rem)] z-50 rounded-2xl border border-border bg-popover shadow-lg overflow-hidden flex flex-col max-h-[70vh]">
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <SearchInput value={q} onChange={setQ} onClose={onClose}
          listId={listId} activeId={activeId} onKeyDown={handleEnter}
          autoFocus className="h-9" />
      </div>
      <div className="flex-1 overflow-y-auto" aria-live="polite" aria-busy={isFetching}>
        <SearchPanel q={q} data={data} isFetching={isFetching}
          activeId={activeId} listId={listId} onNavigate={navigate} />
      </div>
    </div>
  );
}

/* ── Provider ─────────────────────────────────────────────────────────────── */

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const isDesktop = useIsDesktop();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key === 'k') { e.preventDefault(); setIsOpen(true); return; }
      if (e.key === '/' && !isInputActive()) { e.preventDefault(); setIsOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <SearchContext.Provider value={{ isOpen, open, close, anchorRef }}>
      {children}
      {isOpen && isDesktop === false && <MobileSearchOverlay onClose={close} />}
    </SearchContext.Provider>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function isInputActive() {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

import type { SearchResults } from '@/lib/hooks/useSearch';

function buildAllIds(q: string, data: SearchResults | undefined): string[] {
  if (q.trim().length < 2) {
    return Array.from({ length: 5 }, (_, i) => `qa-${i}`);
  }
  const ids: string[] = [];
  (data?.orders.items ?? []).forEach((_, i) => ids.push(`ord-${i}`));
  (data?.customers.items ?? []).forEach((_, i) => ids.push(`cst-${i}`));
  (data?.products.items ?? []).forEach((_, i) => ids.push(`prd-${i}`));
  return ids;
}

function resolveIdHref(id: string, q: string, data: SearchResults | undefined): string | null {
  if (id.startsWith('qa-')) return null;
  const [prefix, idx] = id.split('-');
  const i = parseInt(idx ?? '0', 10);
  if (prefix === 'ord') { const item = data?.orders.items[i]; return item ? `/orders/${item.id}` : null; }
  if (prefix === 'cst') { const item = data?.customers.items[i]; return item ? `/customers/${item.id}` : null; }
  if (prefix === 'prd') { const item = data?.products.items[i]; return item ? `/products/${item.id}` : null; }
  return null;
}
