'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useStockFormat } from '../useStockFormat';

interface EntryStockChangeProps {
  before: string;
  /** Quantité ajoutée ; illisible, le stock après reste le stock actuel. */
  added: number;
}

/** « −2 → 10 » : stock avant (rouge s'il est nul ou négatif), stock après en gras. */
export function EntryStockChange({ before, added }: EntryStockChangeProps) {
  const t = useTranslations('stock.entry');
  const f = useStockFormat();
  const current = Number(before);
  const after = current + (Number.isFinite(added) ? added : 0);
  return (
    <span className="text-[0.8125rem] whitespace-nowrap tabular-nums" aria-label={t('stock_change', { before: f.quantity(current), after: f.quantity(after) })}>
      <span aria-hidden className={cn('font-semibold', current <= 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
        {f.quantity(current)}
      </span>
      <span aria-hidden className="mx-1.5 text-muted-foreground rtl:inline-block rtl:rotate-180">→</span>
      <span aria-hidden className={cn('font-bold', after < 0 ? 'text-red-700 dark:text-red-400' : 'text-foreground')}>
        {f.quantity(after)}
      </span>
    </span>
  );
}
