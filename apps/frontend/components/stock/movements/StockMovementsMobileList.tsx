'use client';

import type { StockMovement } from '@/lib/hooks/useStock';
import { StockListSkeleton } from '../StockListSkeleton';
import { StockLoadMore } from '../StockLoadMore';
import { useStockFormat } from '../useStockFormat';
import { StockMovementCard } from './StockMovementCard';

interface Props {
  movements: StockMovement[];
  isLoading: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

const dayKey = (iso: string) => new Date(iso).toDateString();

interface DayGroup { key: string; first: StockMovement; items: StockMovement[] }

/** Groupe les mouvements par jour local, dans l'ordre reçu. */
function groupByDay(movements: StockMovement[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const m of movements) {
    const last = groups.at(-1);
    if (last && last.key === dayKey(m.created_at)) last.items.push(m);
    else groups.push({ key: dayKey(m.created_at), first: m, items: [m] });
  }
  return groups;
}

export function StockMovementsMobileList({ movements, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage }: Props) {
  const f = useStockFormat();
  if (isLoading) return <StockListSkeleton />;
  if (movements.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      {groupByDay(movements).map((group) => (
        <section key={group.first.id} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.day(group.first.created_at)}</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {group.items.map((m, i) => <StockMovementCard key={m.id} movement={m} first={i === 0} />)}
          </div>
        </section>
      ))}
      {hasNextPage && <StockLoadMore onClick={fetchNextPage} loading={isFetchingNextPage} />}
    </div>
  );
}
