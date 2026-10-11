'use client';

import { useTranslations } from 'next-intl';
import { StockEntryButton } from '@/components/stock/StockEntryButton';
import { StockLevelQuantity } from '@/components/stock/levels/StockLevelQuantity';
import type { ProductVariant } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';
import { ProductFormatState } from './ProductFormatState';
import type { FormatLabels } from './useFormatLabels';
import type { ProductDetailActions } from './useProductDetailState';

interface ProductFormatsListProps {
  formats: ProductVariant[];
  labels: FormatLabels;
  actions: ProductDetailActions;
  canEnter: boolean;
}

/** Formats en lignes (jusqu'au grand écran) : la ligne ouvre la modification, « + Entrée » à côté. */
export function ProductFormatsList({ formats, labels, actions, canEnter }: ProductFormatsListProps) {
  const t = useTranslations('articles.sheet');
  return (
    <ul className="divide-y divide-border xl:hidden">
      {formats.map((v) => (
        <li key={v.id} className="flex items-center gap-3 px-4 py-3 lg:px-5">
          <button type="button" onClick={() => actions.openFormat(v)} aria-label={t('edit_format', { name: labels.full(v) })}
            className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !v.is_active && 'text-muted-foreground')}>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span dir="auto" className="truncate text-sm font-semibold">{labels.name(v)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('format_line', { price: labels.price(v), threshold: labels.threshold(v) })}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1 text-end">
              <StockLevelQuantity quantity={v.stock_quantity} state={v.is_active ? v.stock_state : 'in'} />
              {(!v.is_active || v.stock_state !== 'in') && <ProductFormatState variant={v} />}
            </span>
          </button>
          {canEnter && v.is_active && <StockEntryButton label={labels.full(v)} onClick={() => actions.openEntry(v)} />}
        </li>
      ))}
    </ul>
  );
}
