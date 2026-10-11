'use client';

import { useTranslations } from 'next-intl';
import type { StockLevel } from '@/lib/hooks/useStock';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import type { DataTableColumn } from '@/components/list/dataTableTypes';
import { StockEntryButton } from '../StockEntryButton';
import { StockVariantCell } from '../StockVariantCell';
import { useStockFormat } from '../useStockFormat';
import { StockLevelQuantity } from './StockLevelQuantity';
import { StockStateBadge } from './StockStateBadge';

/** Colonnes de l'onglet Niveaux ; la clé d'une colonne triable est le tri de l'API. */
export function useStockLevelColumns(
  currency: string, onEntry: (level: StockLevel) => void,
): DataTableColumn<StockLevel>[] {
  const t = useTranslations('stock.levels');
  const formatMoney = useFormatMoney();
  const f = useStockFormat();
  const muted = 'text-[0.8125rem] whitespace-nowrap text-muted-foreground';

  return [
    { key: 'name', header: t('column_name'), sortable: true, primary: true,
      cell: (l) => <StockVariantCell productName={l.product_name} packagingName={l.packaging_name} /> },
    { key: 'stock', header: t('column_stock'), sortable: true,
      cell: (l) => <StockLevelQuantity quantity={l.stock_quantity} state={l.state} /> },
    { key: 'threshold', header: t('column_threshold'),
      cell: (l) => <span className={`${muted} tabular-nums`}>{l.low_stock_threshold === null ? '—' : f.quantity(l.low_stock_threshold)}</span> },
    { key: 'state', header: t('column_state'), cell: (l) => <StockStateBadge state={l.state} /> },
    { key: 'purchase_value', header: t('column_value'), align: 'end', sortable: true, firstDirection: 'desc',
      cell: (l) => (
        <span className="whitespace-nowrap text-sm tabular-nums">
          {l.purchase_value === null ? '—' : formatMoney(l.purchase_value, currency)}
        </span>
      ) },
    { key: 'last_movement', header: t('column_last_movement'), sortable: true, firstDirection: 'desc',
      cell: (l) => <span className={muted}>{l.last_movement_at ? f.day(l.last_movement_at) : '—'}</span> },
    { key: 'actions', header: t('column_actions'), headerHidden: true, align: 'end',
      cell: (l) => <StockEntryButton label={f.variantLabel(l.product_name, l.packaging_name)} onClick={() => onEntry(l)} /> },
  ];
}
