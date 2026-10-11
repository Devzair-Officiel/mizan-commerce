'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** « 1 ligne à associer. Vérifiez chaque ligne : rien n'est ajouté au stock avant votre validation. » */
export function InvoiceReviewAlert({ unassociated }: { unassociated: number }) {
  const t = useTranslations('stock.invoice');
  return (
    <p role="status" className={cn('flex flex-wrap gap-x-2.5 gap-y-0.5 px-4 py-3 text-[0.8125rem] text-foreground lg:px-4.5',
      unassociated > 0 ? 'bg-amber-500/10' : 'bg-muted')}>
      {unassociated > 0 && <span className="font-semibold text-amber-700 dark:text-amber-400">{t('to_associate_count', { count: unassociated })}</span>}
      <span>{t('check_lines')}</span>
    </p>
  );
}
