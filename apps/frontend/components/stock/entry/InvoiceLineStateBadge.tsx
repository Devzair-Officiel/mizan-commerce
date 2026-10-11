'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** État d'une ligne de facture : « Associée » (vert) ou « À associer » (ambre). */
export function InvoiceLineStateBadge({ associated }: { associated: boolean }) {
  const t = useTranslations('stock.invoice');
  return (
    <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold',
      associated ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
      {associated ? t('associated') : t('to_associate')}
    </span>
  );
}
