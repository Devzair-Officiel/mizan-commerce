'use client';

import { useTranslations } from 'next-intl';
import type { DataTableColumn } from '@/components/list/dataTableTypes';
import type { StockMovement } from '@/lib/hooks/useStock';
import { StockVariantCell } from '../StockVariantCell';
import { useStockFormat } from '../useStockFormat';
import { MovementQuantity } from './MovementQuantity';
import { MovementReference } from './MovementReference';
import { MovementTypeBadge } from './MovementTypeBadge';

/** Colonnes de l'onglet Mouvements ; seule la date est triable (clé = tri de l'API). */
export function useStockMovementColumns(): DataTableColumn<StockMovement>[] {
  const t = useTranslations('stock.movements');
  const f = useStockFormat();

  return [
    { key: 'created_at', header: t('column_date'), sortable: true, firstDirection: 'desc',
      cell: (m) => <span className="whitespace-nowrap text-[0.8125rem] text-muted-foreground">{f.dateTime(m.created_at)}</span> },
    { key: 'variant', header: t('column_name'), primary: true,
      cell: (m) => <StockVariantCell productName={m.product_name} packagingName={m.variant_name} /> },
    { key: 'type', header: t('column_type'), cell: (m) => <MovementTypeBadge group={m.type_group} /> },
    { key: 'quantity', header: t('column_quantity'), align: 'end', cell: (m) => <MovementQuantity signed={m.signed_quantity} /> },
    { key: 'reference', header: t('column_reference'),
      cell: (m) => <span className="text-[0.8125rem]"><MovementReference movement={m} /></span> },
    { key: 'author', header: t('column_author'),
      cell: (m) => <span dir="auto" className="whitespace-nowrap text-[0.8125rem] text-muted-foreground">{m.author_name || '—'}</span> },
  ];
}
