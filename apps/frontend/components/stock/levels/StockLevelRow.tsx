'use client';

import Link from 'next/link';
import type { StockLevel } from '@/lib/hooks/useStock';
import { cn } from '@/lib/utils';
import { StockEntryButton } from '../StockEntryButton';
import { StockVariantCell } from '../StockVariantCell';
import { useStockFormat } from '../useStockFormat';
import { StockLevelQuantity } from './StockLevelQuantity';
import { StockStateBadge } from './StockStateBadge';

interface StockLevelRowProps {
  level: StockLevel;
  first: boolean;
  onEntry: () => void;
}

/** Carte mobile d'un format : lien vers l'article, stock et état, bouton « + Entrée » à part. */
export function StockLevelRow({ level, first, onEntry }: StockLevelRowProps) {
  const f = useStockFormat();
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', !first && 'border-t border-border')}>
      <Link href={`/products/${level.product_id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <StockVariantCell productName={level.product_name} packagingName={level.packaging_name} />
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-end">
          <StockLevelQuantity quantity={level.stock_quantity} state={level.state} />
          {level.state !== 'in' && level.state !== 'negative' && <StockStateBadge state={level.state} />}
        </span>
      </Link>
      <StockEntryButton label={f.variantLabel(level.product_name, level.packaging_name)} onClick={onEntry} />
    </div>
  );
}
