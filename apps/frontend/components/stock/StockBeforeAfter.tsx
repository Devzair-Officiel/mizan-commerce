'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useStockFormat } from './useStockFormat';

interface StockBeforeAfterProps {
  before: string;
  /** Quantité ajoutée (négative pour une sortie) ; illisible, seul le stock actuel s'affiche. */
  added: number;
}

/** « Stock actuel −2 → 10 après l'entrée » ; un stock négatif reste en rouge. */
export function StockBeforeAfter({ before, added }: StockBeforeAfterProps) {
  const t = useTranslations('stock.common');
  const f = useStockFormat();
  const current = Number(before);
  const after = current + (Number.isFinite(added) ? added : 0);
  const tone = (n: number) => cn('font-bold tabular-nums', n < 0 ? 'text-red-700 dark:text-red-400' : 'text-foreground');
  return (
    <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
      {t.rich('before_after', {
        before: f.quantity(current), after: f.quantity(after),
        b: (chunks) => <span className={tone(current)}>{chunks}</span>,
        a: (chunks) => <span className={tone(after)}>{chunks}</span>,
      })}
    </p>
  );
}
