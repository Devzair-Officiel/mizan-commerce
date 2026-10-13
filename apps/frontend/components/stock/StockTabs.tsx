'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type StockTab = 'levels' | 'movements';
const TABS: readonly StockTab[] = ['levels', 'movements'];
export const STOCK_PANEL_ID = 'stock-panel';

interface StockTabsProps {
  active: StockTab;
  counts: Partial<Record<StockTab, number>>;
  onChange: (tab: StockTab) => void;
}

/** Onglets « Niveaux » et « Mouvements » (flèches au clavier, activation immédiate). */
export function StockTabs({ active, counts, onChange }: StockTabsProps) {
  const t = useTranslations('stock.tabs');
  const refs = useRef<Partial<Record<StockTab, HTMLButtonElement | null>>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: StockTab = active === 'levels' ? 'movements' : 'levels';
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={t('label')} onKeyDown={onKeyDown}
      className="flex gap-1 self-stretch rounded-[0.875rem] bg-muted p-1 lg:self-start">
      {TABS.map((tab) => {
        const selected = tab === active;
        return (
          <button key={tab} ref={(el) => { refs.current[tab] = el; }} type="button" role="tab" id={`stock-tab-${tab}`}
            aria-selected={selected} aria-controls={STOCK_PANEL_ID} tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            className={cn(
              'h-9 flex-1 rounded-[0.625rem] px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-none',
              selected ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
            )}>
            {t(tab)}
            {counts[tab] !== undefined && <span className="ms-1.5 font-medium tabular-nums text-muted-foreground">{counts[tab]}</span>}
          </button>
        );
      })}
    </div>
  );
}
