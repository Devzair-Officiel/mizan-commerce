import { useTranslations } from 'next-intl';
import type { StockMovementGroup } from '@/lib/hooks/useStock';
import { cn } from '@/lib/utils';

/** Badge de famille : source unique pour le tableau, les cartes et le menu Mouvement. */
export const MOVEMENT_BADGE: Record<StockMovementGroup, string> = {
  in: 'bg-green-500/10 text-green-700 dark:text-green-400',
  out: 'bg-red-500/10 text-red-700 dark:text-red-400',
  reservation: 'bg-muted text-muted-foreground',
  release: 'bg-muted text-muted-foreground',
  adjustment: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

export function MovementTypeBadge({ group }: { group: StockMovementGroup }) {
  const t = useTranslations('stock.movements.type');
  return (
    <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', MOVEMENT_BADGE[group])}>
      {t(group)}
    </span>
  );
}
