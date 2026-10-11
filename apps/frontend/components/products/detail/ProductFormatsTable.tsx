'use client';

import { useTranslations } from 'next-intl';
import { StockEntryButton } from '@/components/stock/StockEntryButton';
import { StockLevelQuantity } from '@/components/stock/levels/StockLevelQuantity';
import type { ProductVariant } from '@/lib/hooks/useProducts';
import { cn } from '@/lib/utils';
import { ProductFormatState } from './ProductFormatState';
import type { FormatLabels } from './useFormatLabels';
import type { ProductDetailActions } from './useProductDetailState';

const TH = 'px-4.5 py-2.5 text-start text-xs font-semibold text-muted-foreground';
const TD = 'px-4.5 py-3 align-middle text-sm';
const COLUMNS = ['col_format', 'col_price', 'col_stock', 'col_threshold', 'col_state'] as const;

interface ProductFormatsTableProps {
  formats: ProductVariant[];
  labels: FormatLabels;
  actions: ProductDetailActions;
  /** Article actif : « + Entrée » sur ses formats actifs. */
  canEnter: boolean;
}

/** Tableau des formats (grand écran) : le nom ouvre la modification, « + Entrée » l'entrée rapide. */
export function ProductFormatsTable({ formats, labels, actions, canEnter }: ProductFormatsTableProps) {
  const t = useTranslations('articles.sheet');
  return (
    <table className="hidden w-full border-collapse xl:table">
      <thead className="bg-muted">
        <tr>
          {COLUMNS.map((k) => <th key={k} className={TH}>{t(k)}</th>)}
          <th className={TH}><span className="sr-only">{t('col_actions')}</span></th>
        </tr>
      </thead>
      <tbody>
        {formats.map((v) => (
          <tr key={v.id} className={cn('border-t border-border', !v.is_active && 'text-muted-foreground')}>
            <td className={TD}>
              <button type="button" onClick={() => actions.openFormat(v)} aria-label={t('edit_format', { name: labels.full(v) })}
                className="text-start font-semibold hover:underline focus-visible:underline focus-visible:outline-none">
                <span dir="auto">{labels.name(v)}</span>
              </button>
            </td>
            <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{labels.price(v)}</td>
            <td className={TD}><StockLevelQuantity quantity={v.stock_quantity} state={v.is_active ? v.stock_state : 'in'} /></td>
            <td className={cn(TD, 'tabular-nums text-muted-foreground')}>{labels.threshold(v)}</td>
            <td className={TD}><ProductFormatState variant={v} /></td>
            <td className={cn(TD, 'text-end')}>
              {canEnter && v.is_active && <StockEntryButton label={labels.full(v)} onClick={() => actions.openEntry(v)} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
