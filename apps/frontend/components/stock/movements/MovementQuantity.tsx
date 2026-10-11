import { cn } from '@/lib/utils';
import { useStockFormat } from '../useStockFormat';

/** Quantité signée d'un mouvement : « +6 » en vert, « −2 » en couleur de texte. */
export function MovementQuantity({ signed }: { signed: string }) {
  const f = useStockFormat();
  return (
    <span className={cn('whitespace-nowrap text-sm font-bold tabular-nums', Number(signed) > 0 ? 'text-green-700 dark:text-green-400' : 'text-foreground')}>
      {f.quantity(signed, true)}
    </span>
  );
}
