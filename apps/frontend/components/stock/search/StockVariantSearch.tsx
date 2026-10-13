'use client';

import { useId, useRef, useState } from 'react';
import { Loader2, ScanBarcode, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { StockLevel } from '@/lib/hooks/useStock';
import { StockVariantOptions } from './StockVariantOptions';
import { useStockVariantSearch } from './useStockVariantSearch';

interface StockVariantSearchProps {
  onPick: (level: StockLevel) => void;
  /** Bouton « Scanner » : la lecture par caméra n'existe pas encore, il prépare la douchette. */
  scanner?: boolean;
  autoFocus?: boolean;
}

/** Champ « Ajouter un article : nom, référence ou code-barres » et ses résultats. */
export function StockVariantSearch({ onPick, scanner = true, autoFocus }: StockVariantSearchProps) {
  const t = useTranslations('stock.search');
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanHelp, setScanHelp] = useState(false);
  const s = useStockVariantSearch(onPick);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 inset-s-3.5 flex items-center text-muted-foreground" aria-hidden>
            {s.loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          </span>
          <input ref={inputRef} type="search" role="combobox" aria-expanded={s.expanded} aria-controls={listId}
            aria-autocomplete="list" aria-activedescendant={s.expanded && s.results[s.active] ? `${listId}-${s.active}` : undefined}
            aria-label={t('label')} placeholder={t('placeholder')} autoComplete="off" autoFocus={autoFocus}
            value={s.query} onChange={(e) => s.change(e.target.value)} onKeyDown={s.onKeyDown} onBlur={s.close} onFocus={s.reopen}
            className="h-11 w-full rounded-full border border-border bg-background ps-10 pe-4 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20" />
          {s.expanded && <StockVariantOptions id={listId} results={s.results} active={s.active} onPick={s.pick} />}
        </div>
        {scanner && (
          <Button type="button" variant="outline" onClick={() => { setScanHelp(true); inputRef.current?.focus(); }}
            className="h-10 shrink-0 gap-2 rounded-full px-4 text-sm font-medium max-sm:w-10 max-sm:px-0">
            <ScanBarcode size={16} aria-hidden /><span className="max-sm:sr-only">{t('scan')}</span>
          </Button>
        )}
      </div>
      {scanHelp && <p role="status" className="px-1 text-[0.8125rem] text-muted-foreground">{t('scan_help')}</p>}
    </div>
  );
}
