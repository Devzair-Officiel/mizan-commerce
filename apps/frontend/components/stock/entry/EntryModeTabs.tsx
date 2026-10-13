'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Camera, PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type EntryMode = 'manual' | 'invoice';
const MODES: readonly EntryMode[] = ['manual', 'invoice'];
const ICONS = { manual: PencilLine, invoice: Camera } as const;
export const ENTRY_PANEL_ID = 'stock-entry-panel';

interface EntryModeTabsProps {
  active: EntryMode;
  onChange: (mode: EntryMode) => void;
}

/** « Saisir à la main » / « Depuis une facture fournisseur » (flèches au clavier). */
export function EntryModeTabs({ active, onChange }: EntryModeTabsProps) {
  const t = useTranslations('stock.entry.mode');
  const refs = useRef<Partial<Record<EntryMode, HTMLButtonElement | null>>>({});
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: EntryMode = active === 'manual' ? 'invoice' : 'manual';
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={t('label')} onKeyDown={onKeyDown} className="grid grid-cols-2 gap-1 rounded-[0.875rem] bg-muted p-1">
      {MODES.map((mode) => {
        const selected = mode === active;
        const Icon = ICONS[mode];
        return (
          <button key={mode} ref={(el) => { refs.current[mode] = el; }} type="button" role="tab" id={`stock-entry-tab-${mode}`}
            aria-selected={selected} aria-controls={ENTRY_PANEL_ID} tabIndex={selected ? 0 : -1} onClick={() => onChange(mode)}
            className={cn(
              'flex h-10 min-w-0 items-center justify-center gap-2 rounded-[0.625rem] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
            )}>
            <Icon size={16} aria-hidden className="shrink-0" />
            <span className="truncate"><span className="sm:hidden">{t(`${mode}_short`)}</span><span className="max-sm:hidden">{t(mode)}</span></span>
          </button>
        );
      })}
    </div>
  );
}
