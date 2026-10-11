'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Package, Pencil } from 'lucide-react';
import { FloatingInput } from '@/components/ui/floating-fields';
import {
  STOCK_CATEGORIES,
  formatMoney,
  type StockBreakdownItem,
  type StockCategory,
} from '@/lib/hooks/useZakat';
import { ReligiousNote } from './ReligiousNote';

interface Step2Props {
  estimatedStock: string;
  productCount: number;
  stockBreakdown: StockBreakdownItem[];
  currency: string;
  isLoadingEstimate: boolean;
  onChange: (patch: { stockBreakdown?: StockBreakdownItem[] }) => void;
}

function getAmount(breakdown: StockBreakdownItem[], category: StockCategory): string {
  return breakdown.find((b) => b.category === category)?.amount ?? '';
}

function setAmount(
  breakdown: StockBreakdownItem[],
  category: StockCategory,
  amount: string,
): StockBreakdownItem[] {
  const others = breakdown.filter((b) => b.category !== category);
  if (amount === '' || parseFloat(amount) === 0) return others;
  return [...others, { category, amount }];
}

function sumBreakdown(breakdown: StockBreakdownItem[]): number {
  return breakdown.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
}

export function Step2Stock({
  estimatedStock,
  productCount,
  stockBreakdown,
  currency,
  isLoadingEstimate,
  onChange,
}: Step2Props) {
  // L'utilisateur peut basculer en édition pour ventiler — par défaut on fait confiance à l'estimation.
  const t = useTranslations('zakat');
  const [isEditing, setIsEditing] = useState(stockBreakdown.length > 0);
  const breakdownTotal = sumBreakdown(stockBreakdown);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <Package className="text-primary shrink-0 mt-0.5" size={18} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{t('step.stock.title')}</p>
          <p className="text-xs text-muted-foreground">{t('step.stock.help')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card px-5 py-4 flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('step.stock.estimate')}
        </p>
        <p className="text-2xl font-semibold text-foreground tabular-nums">
          {isLoadingEstimate ? '…' : formatMoney(estimatedStock, currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('step.stock.estimate_basis', { count: productCount })}
        </p>
      </div>

      {!isEditing ? (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          <Pencil size={14} />
          {t('step.stock.breakdown')}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {STOCK_CATEGORIES.map((cat) => (
            <FloatingInput
              key={cat}
              id={`z-stock-${cat}`}
              label={t(`stock_category.${cat}`)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              suffix={currency}
              value={getAmount(stockBreakdown, cat)}
              onChange={(e) =>
                onChange({ stockBreakdown: setAmount(stockBreakdown, cat, e.target.value) })
              }
            />
          ))}

          <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">{t('step.stock.total')}</p>
            <p className="text-lg font-semibold text-primary tabular-nums">
              {formatMoney(breakdownTotal, currency)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              onChange({ stockBreakdown: [] });
            }}
            className="self-start text-xs text-muted-foreground hover:text-foreground underline"
          >
            {t('step.stock.back_to_estimate')}
          </button>
        </div>
      )}

      <ReligiousNote rubric="stock" />
    </div>
  );
}
