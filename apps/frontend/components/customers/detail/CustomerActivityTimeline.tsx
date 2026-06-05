import { History } from 'lucide-react';
import { useCustomerActivityInfinite, type ActivityType } from '@/lib/hooks/useCustomers';
import { ActivityRow, ActivitySkeletonRow } from './ActivityRow';

interface CustomerActivityTimelineProps {
  customerId: string;
  activityFilter: ActivityType | null;
  pendingOnly: boolean;
  onFilterChange: (filter: ActivityType | null) => void;
}

const CHIPS: { key: ActivityType | null; label: string }[] = [
  { key: null,       label: 'Tout' },
  { key: 'order',    label: 'Commandes' },
  { key: 'payment',  label: 'Paiements' },
  { key: 'shipment', label: 'Expéditions' },
  { key: 'note',     label: 'Notes' },
];

export function CustomerActivityTimeline({
  customerId, activityFilter, pendingOnly, onFilterChange,
}: CustomerActivityTimelineProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useCustomerActivityInfinite(customerId, activityFilter, pendingOnly);

  const allItems = data?.pages.flatMap((p) => p.results) ?? [];
  const totalCount = data?.pages[0]?.count ?? 0;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <History size={15} className="text-muted-foreground" />
          <h2 className="font-semibold text-sm text-foreground">Activité récente</h2>
          {totalCount > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {totalCount}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto px-4 pb-3 -mx-px">
        <div className="flex gap-2 w-max">
          {CHIPS.map(({ key, label }) => {
            const active = activityFilter === key;
            return (
              <button
                key={String(key)}
                type="button"
                onClick={() => onFilterChange(key)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground active:bg-muted/70'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border overflow-hidden rounded-b-2xl">
        {isLoading ? (
          <div className="flex flex-col divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <ActivitySkeletonRow key={i} />
            ))}
          </div>
        ) : !allItems.length ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <History size={20} />
            </div>
            <p className="text-sm font-medium text-foreground">Aucune activité</p>
            <p className="text-xs text-muted-foreground">L’activité du client apparaîtra ici.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {allItems.map((item) => (
              <ActivityRow key={item.id} item={item} customerId={customerId} />
            ))}
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full py-3 text-xs font-medium text-primary transition-colors active:bg-muted"
              >
                {isFetchingNextPage ? 'Chargement…' : `Voir plus (${totalCount - allItems.length} restantes)`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
