import { useTranslations } from 'next-intl';
import type { StockState } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';
import { useStockFormat } from '../useStockFormat';

const TONE: Record<StockState, string> = {
  negative: 'font-bold text-red-700 dark:text-red-400',
  out: 'font-bold text-red-700 dark:text-red-400',
  low: 'font-semibold text-amber-700 dark:text-amber-400',
  in: '',
};

/** Stock d'un format : « −2 » rouge avec « à régulariser » dessous, 0 rouge, faible en ambre. */
export function StockLevelQuantity({ quantity, state }: { quantity: string; state: StockState }) {
  const t = useTranslations('stock.levels');
  const f = useStockFormat();
  return (
    <span className="block whitespace-nowrap leading-tight">
      <span className={cn('text-sm tabular-nums', TONE[state])}>{f.quantity(quantity)}</span>
      {state === 'negative' && (
        <span className="block text-xs text-red-700 dark:text-red-400">{t('to_regularize')}</span>
      )}
    </span>
  );
}
