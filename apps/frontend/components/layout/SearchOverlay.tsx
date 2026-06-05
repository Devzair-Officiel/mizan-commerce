'use client';

import { useState, useEffect, useRef, useId, createContext, useContext, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, X, Package, Users, ShoppingBag } from 'lucide-react';
import { useSearch } from '@/lib/hooks/useSearch';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';

type OrderStatusKey = 'draft' | 'to_prepare' | 'prepared' | 'shipped' | 'cancelled';
const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  'draft', 'to_prepare', 'prepared', 'shipped', 'cancelled',
]);

interface SearchContextValue {
  open: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);

  return (
    <SearchContext.Provider value={{ open }}>
      {children}
      {isOpen && <SearchOverlayPanel onClose={() => setIsOpen(false)} />}
    </SearchContext.Provider>
  );
}

export function useSearchOverlay() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearchOverlay must be used inside SearchProvider');
  return ctx;
}

function SearchOverlayPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('layout.search');
  const tStatus = useTranslations('layout.orderStatus');
  const [q, setQ] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useFocusTrap<HTMLDivElement>(true);
  const router = useRouter();
  const { data, isFetching } = useSearch(q);
  const titleId = useId();

  function statusLabel(status: string): string {
    return KNOWN_STATUSES.has(status) ? tStatus(status as OrderStatusKey) : status;
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (visible) inputRef.current?.focus();
  }, [visible]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  const hasResults = data && (
    data.products.length > 0 || data.customers.length > 0 || data.orders.length > 0
  );
  const showEmpty = q.trim().length >= 2 && !isFetching && !hasResults;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-100 flex flex-col backdrop-blur-md transition-opacity duration-200 outline-none"
      style={{
        background: 'color-mix(in oklch, var(--background) 72%, transparent)',
        opacity: visible ? 1 : 0,
      }}
    >
      <h2 id={titleId} className="sr-only">{t('title')}</h2>

      <div
        className="flex items-center gap-3 border-b border-border px-4 h-14 shrink-0 transition-transform duration-200"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(-8px)' }}
      >
        <Search size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('aria_label')}
          className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('close')}
          className="text-muted-foreground p-1"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4" aria-live="polite" aria-busy={isFetching}>

        {q.trim().length < 2 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            {t('min_chars')}
          </p>
        )}

        {isFetching && q.trim().length >= 2 && (
          <p className="text-sm text-muted-foreground text-center py-12">{t('searching')}</p>
        )}

        {showEmpty && (
          <p className="text-sm text-muted-foreground text-center py-12">
            {t('no_results', { query: q })}
          </p>
        )}

        {data && data.products.length > 0 && (
          <section aria-label={t('section_products')}>
            <div className="flex items-center gap-2 mb-2">
              <Package size={14} className="text-muted-foreground" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('section_products')}</p>
            </div>
            <div className="flex flex-col rounded-xl border border-border overflow-hidden">
              {data.products.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/products/${p.id}`)}
                  className={`flex items-center justify-between px-4 py-3 text-start bg-card active:bg-muted transition-colors ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    {p.reference && <p className="text-xs text-muted-foreground">{p.reference}</p>}
                  </div>
                  {p.type === 'product' && (
                    <p className={`text-xs shrink-0 ms-3 ${p.is_out_of_stock ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {p.is_out_of_stock
                        ? t('out_of_stock')
                        : t('formats', { count: p.variant_count })}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {data && data.customers.length > 0 && (
          <section aria-label={t('section_customers')}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-muted-foreground" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('section_customers')}</p>
            </div>
            <div className="flex flex-col rounded-xl border border-border overflow-hidden">
              {data.customers.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className={`flex items-center justify-between px-4 py-3 text-start bg-card active:bg-muted transition-colors ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground shrink-0 ms-3">
                    {c.phone && <span>{c.phone}</span>}
                    {c.city && <span>{c.city}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {data && data.orders.length > 0 && (
          <section aria-label={t('section_orders')}>
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={14} className="text-muted-foreground" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('section_orders')}</p>
            </div>
            <div className="flex flex-col rounded-xl border border-border overflow-hidden">
              {data.orders.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className={`flex items-center justify-between px-4 py-3 text-start bg-card active:bg-muted transition-colors ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{o.order_number}</p>
                    {o.customer_name && <p className="text-xs text-muted-foreground">{o.customer_name}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0 ms-3">
                    <p className="text-xs text-muted-foreground">{statusLabel(o.status)}</p>
                    <p className="text-xs font-medium text-foreground">{o.total_amount} €</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
