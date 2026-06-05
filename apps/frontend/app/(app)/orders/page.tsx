'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useOrders, type OrderSummary } from '@/lib/hooks/useOrders';
import { StatusFilters } from '@/components/orders/list/StatusFilters';
import { AlertBanner } from '@/components/orders/list/AlertBanner';
import { OrderRow } from '@/components/orders/list/OrderRow';
import { EmptyState } from '@/components/orders/list/EmptyState';
import { getAlert } from '@/components/orders/list/alert';
import { bucketOf } from '@/components/orders/list/bucket';
import { type Bucket, BUCKET_LABEL, BUCKET_ORDER } from '@/components/orders/list/constants';

function OrdersList() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [alertsOnly, setAlertsOnly] = useState(false);
  const { data, isLoading } = useOrders({ status: statusFilter || undefined });

  const allOrders = useMemo(() => data?.results ?? [], [data]);
  const alertCount = useMemo(() => allOrders.filter((o) => getAlert(o) !== null).length, [allOrders]);

  const visibleOrders = useMemo(
    () => (alertsOnly ? allOrders.filter((o) => getAlert(o) !== null) : allOrders),
    [allOrders, alertsOnly],
  );

  const grouped = useMemo(() => {
    const groups: Record<Bucket, OrderSummary[]> = { today: [], yesterday: [], this_week: [], older: [] };
    for (const o of visibleOrders) groups[bucketOf(o.created_at)].push(o);
    return groups;
  }, [visibleOrders]);

  const totalCount = visibleOrders.length;
  const hasResults = !isLoading && totalCount > 0;

  return (
    <>
      <StatusFilters value={statusFilter} onChange={setStatusFilter} />

      {alertCount > 0 && (
        <AlertBanner count={alertCount} active={alertsOnly} onToggle={() => setAlertsOnly((v) => !v)} />
      )}

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Chargement…'
            : `${totalCount} commande${totalCount > 1 ? 's' : ''}${statusFilter || alertsOnly ? ' · filtré' : ''}`}
        </p>
        <Link
          href="/orders/new"
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform self-start"
        >
          <Plus size={16} strokeWidth={2.4} />
          Nouvelle commande
        </Link>
      </div>

      {!isLoading && totalCount === 0 && <EmptyState filtered={!!statusFilter || alertsOnly} />}

      {hasResults && (
        <div className="flex flex-col gap-5">
          {BUCKET_ORDER.map((bucket) => {
            const orders = grouped[bucket];
            if (orders.length === 0) return null;
            return (
              <section key={bucket} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  {BUCKET_LABEL[bucket]}
                  <span className="text-muted-foreground/60 normal-case font-normal tracking-normal ml-1.5">
                    ({orders.length})
                  </span>
                </h2>
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  {orders.map((order, i) => (
                    <OrderRow key={order.id} order={order} bucket={bucket} first={i === 0} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <>
      <TopBar title="Commandes" titleClassName="text-3xl" />
      <div className="flex flex-col gap-4 p-4 lg:px-8 lg:py-6 pb-28">
        <Suspense>
          <OrdersList />
        </Suspense>
      </div>
    </>
  );
}
