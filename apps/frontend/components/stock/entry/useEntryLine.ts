'use client';

import { useWatch } from 'react-hook-form';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { parseQuantity } from '../QuantityStepper';
import { useStockFormat } from '../useStockFormat';
import { lineTotal, type StockEntryForm } from './useStockEntryForm';

/** Valeurs suivies d'une ligne : libellé (format associé ou texte lu), quantité ajoutée et total. */
export function useEntryLine(form: StockEntryForm, index: number, currencyCode: string) {
  const line = useWatch({ control: form.control, name: `lines.${index}` });
  const f = useStockFormat();
  const formatMoney = useFormatMoney();
  const total = lineTotal(line.quantity, line.price);
  return {
    line,
    label: line.variant ? f.variantLabel(line.name, line.packaging) : line.readLabel,
    added: parseQuantity(line.quantity),
    total: total === null ? null : formatMoney(total, currencyCode),
  };
}
