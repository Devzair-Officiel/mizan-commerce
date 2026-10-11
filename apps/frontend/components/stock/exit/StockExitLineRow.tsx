'use client';

import { EntryRemoveButton } from '../entry/EntryRemoveButton';
import { EntryStockChange } from '../entry/EntryStockChange';
import { StockVariantCell } from '../StockVariantCell';
import { ExitGap } from './ExitGap';
import { ExitQuantityField } from './ExitQuantityField';
import type { StockExitLineProps } from './exitLineTypes';
import { useExitLine } from './useExitLine';

const CELL = 'px-4.5 py-3 align-middle';

/** Ligne du tableau de sortie (desktop) ; en correction, une colonne « Écart » de plus. */
export function StockExitLineRow({ form, index, onRemove }: StockExitLineProps) {
  const { line, counting, label, change } = useExitLine(form, index);
  return (
    <tr className="border-t border-border">
      <td className={`${CELL} max-w-72`}><StockVariantCell productName={line.name} packagingName={line.packaging} /></td>
      <td className={CELL}><EntryStockChange before={line.stock} added={change} /></td>
      <td className={CELL}><ExitQuantityField form={form} index={index} label={label} counting={counting} className="w-32" /></td>
      {counting && <td className={`${CELL} text-end`}><ExitGap gap={change} /></td>}
      <td className="py-3 pe-3 align-middle"><EntryRemoveButton label={label} onClick={onRemove} /></td>
    </tr>
  );
}
