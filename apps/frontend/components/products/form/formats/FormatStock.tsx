'use client';

import { StockEntryButton } from '@/components/stock/StockEntryButton';
import { useFormatNumber } from '@/lib/hooks/useFormat';
import type { ProductVariant } from '@/lib/hooks/useProducts';

interface FormatStockProps {
  variant: ProductVariant;
  label: string;
  onEntry: (variant: ProductVariant) => void;
  /** Liaison au libellé de la carte mobile. */
  id?: string;
}

/** Stock d'un format enregistré : lecture seule (il ne change que par une entrée), et « + Entrée ». */
export function FormatStock({ variant, label, onEntry, id }: FormatStockProps) {
  const formatNumber = useFormatNumber();
  return (
    <div className="flex h-10 items-center gap-2">
      <output id={id} className="min-w-6 text-sm font-semibold tabular-nums text-foreground">
        {formatNumber(Number(variant.stock_quantity), { maximumFractionDigits: 3 })}
      </output>
      <StockEntryButton label={label} onClick={() => onEntry(variant)} />
    </div>
  );
}
