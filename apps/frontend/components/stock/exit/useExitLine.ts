'use client';

import { useWatch } from 'react-hook-form';
import { parseQuantity } from '../QuantityStepper';
import { useStockFormat } from '../useStockFormat';
import { lineGap, type StockExitForm } from './useStockExitForm';

/** Valeurs suivies d'une ligne : libellé, correction ou non, variation du stock (sortie : −quantité ; correction : écart). */
export function useExitLine(form: StockExitForm, index: number) {
  const [line, reason] = useWatch({ control: form.control, name: [`lines.${index}`, 'reason'] });
  const f = useStockFormat();
  const counting = reason === 'adjustment';
  return {
    line,
    counting,
    label: f.variantLabel(line.name, line.packaging),
    change: counting ? lineGap(line.stock, line.quantity) : -parseQuantity(line.quantity),
  };
}
