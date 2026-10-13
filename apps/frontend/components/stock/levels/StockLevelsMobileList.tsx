'use client';

import type { StockLevel } from '@/lib/hooks/useStock';
import { StockListSkeleton } from '../StockListSkeleton';
import { StockLoadMore } from '../StockLoadMore';
import { StockLevelRow } from './StockLevelRow';

interface Props {
  levels: StockLevel[];
  isLoading: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  onEntry: (level: StockLevel) => void;
}

export function StockLevelsMobileList({ levels, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage, onEntry }: Props) {
  if (isLoading) return <StockListSkeleton />;
  if (levels.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {levels.map((level, i) => (
          <StockLevelRow key={level.id} level={level} first={i === 0} onEntry={() => onEntry(level)} />
        ))}
      </div>
      {hasNextPage && <StockLoadMore onClick={fetchNextPage} loading={isFetchingNextPage} />}
    </div>
  );
}
