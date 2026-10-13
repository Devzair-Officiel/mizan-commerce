'use client';

import { useTranslations } from 'next-intl';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LineItem } from './types';

/** Quantité au-delà du stock : la vente passe quand même, le format passera en négatif. */
export function LineStockWarning({ item, className }: { item: LineItem; className?: string }) {
  const t = useTranslations('orders.new');
  if (item.stock === undefined || item.quantity <= Number(item.stock)) return null;
  return (
    <p className={cn('flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400', className)}>
      <TriangleAlert size={13} aria-hidden className="shrink-0" />
      {t('stock_negative_warning')}
    </p>
  );
}
