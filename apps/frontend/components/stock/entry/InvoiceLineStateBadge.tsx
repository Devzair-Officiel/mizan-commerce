'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type InvoiceLineState = 'associated' | 'to_associate' | 'ignored';

const TONE: Record<InvoiceLineState, string> = {
  associated: 'bg-green-500/10 text-green-700 dark:text-green-400',
  to_associate: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  ignored: 'bg-muted text-muted-foreground',
};

/** État d'une ligne de facture : « Associée » (vert), « À associer » (ambre) ou « Ignorée » (neutre). */
export function InvoiceLineStateBadge({ state }: { state: InvoiceLineState }) {
  const t = useTranslations('stock.invoice');
  return (
    <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', TONE[state])}>
      {t(state)}
    </span>
  );
}
