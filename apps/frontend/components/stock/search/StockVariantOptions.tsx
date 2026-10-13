'use client';

import { useTranslations } from 'next-intl';
import type { StockLevel } from '@/lib/hooks/useStock';
import { cn } from '@/lib/utils';
import { StockVariantCell } from '../StockVariantCell';
import { useStockFormat } from '../useStockFormat';

interface StockVariantOptionsProps {
  id: string;
  results: StockLevel[];
  active: number;
  onPick: (level: StockLevel) => void;
}

/** Résultats de la recherche d'article : nom, format et stock actuel. */
export function StockVariantOptions({ id, results, active, onPick }: StockVariantOptionsProps) {
  const t = useTranslations('stock.search');
  const f = useStockFormat();

  return (
    <ul id={id} role="listbox" aria-label={t('results')}
      className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card py-1 shadow-xl">
      {results.length === 0 && <li role="presentation" className="px-4 py-3 text-sm text-muted-foreground">{t('empty')}</li>}
      {results.map((level, i) => (
        <li key={level.id} id={`${id}-${i}`} role="option" aria-selected={i === active}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(level)}
          className={cn('flex cursor-pointer items-center gap-3 px-4 py-2.5', i === active ? 'bg-muted' : 'hover:bg-muted/60')}>
          <span className="min-w-0 flex-1"><StockVariantCell productName={level.product_name} packagingName={level.packaging_name} /></span>
          <span className={cn('shrink-0 text-[0.8125rem] tabular-nums',
            Number(level.stock_quantity) <= 0 ? 'font-semibold text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
            {t('stock', { quantity: f.quantity(level.stock_quantity) })}
          </span>
        </li>
      ))}
    </ul>
  );
}
