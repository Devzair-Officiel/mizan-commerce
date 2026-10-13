'use client';

import { useTranslations } from 'next-intl';
import { EntryRemoveButton } from '../entry/EntryRemoveButton';
import { EntryStockChange } from '../entry/EntryStockChange';
import { StockVariantCell } from '../StockVariantCell';
import { ExitGap } from './ExitGap';
import { ExitQuantityField } from './ExitQuantityField';
import type { StockExitLineProps } from './exitLineTypes';
import { useExitLine } from './useExitLine';

/** Ligne de sortie en carte (mobile) : article, stock avant → après, quantité ; en correction, l'écart à côté. */
export function StockExitLineCard({ form, index, onRemove }: StockExitLineProps) {
  const t = useTranslations('stock.exit');
  const te = useTranslations('stock.entry');
  const { line, counting, label, change } = useExitLine(form, index);
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><StockVariantCell productName={line.name} packagingName={line.packaging} /></div>
        <EntryRemoveButton label={label} onClick={onRemove} />
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">
        {te('card_stock')} <EntryStockChange before={line.stock} added={change} />
      </p>
      <div className="grid grid-cols-2 items-center gap-3">
        <ExitQuantityField form={form} index={index} label={label} counting={counting} />
        {counting && (
          <p className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">{t('col_gap')}</span>
            <ExitGap gap={change} />
          </p>
        )}
      </div>
    </li>
  );
}
