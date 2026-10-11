import { useTranslations } from 'next-intl';
import type { StockState } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';

/** Badge d'état : source unique pour le tableau, les cartes et le menu État. */
export const STATE_BADGE: Record<StockState, string> = {
  negative: 'bg-red-500/10 text-red-700 dark:text-red-400',
  out: 'bg-red-500/10 text-red-700 dark:text-red-400',
  low: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  in: 'bg-green-500/10 text-green-700 dark:text-green-400',
};

export function StockStateBadge({ state }: { state: StockState }) {
  const t = useTranslations('stock.levels.badge');
  return (
    <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', STATE_BADGE[state])}>
      {t(state)}
    </span>
  );
}
