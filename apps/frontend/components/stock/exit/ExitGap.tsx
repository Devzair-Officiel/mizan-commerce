'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useStockFormat } from '../useStockFormat';

/** Écart d'une correction : « +3 » en vert, « −2 » en rouge, « 0 » discret ; « — » si la quantité est illisible. */
export function ExitGap({ gap }: { gap: number }) {
  const t = useTranslations('stock.exit');
  const tc = useTranslations('stock.common');
  const f = useStockFormat();
  if (!Number.isFinite(gap)) return <span aria-label={tc('none')}>—</span>;
  return (
    <span aria-label={t('gap_aria', { gap: f.quantity(gap, true) })} className={cn('text-sm font-semibold whitespace-nowrap tabular-nums',
      gap > 0 ? 'text-green-700 dark:text-green-400' : gap < 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground')}>
      {f.quantity(gap, true)}
    </span>
  );
}
