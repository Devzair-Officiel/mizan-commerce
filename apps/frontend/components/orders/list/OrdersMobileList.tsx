'use client';

import { useTranslations } from 'next-intl';
import { OrderRow } from './OrderRow';
import { bucketOf } from './bucket';
import { type Bucket, BUCKET_ORDER } from './constants';
import type { OrderSummary } from '@/lib/hooks/useOrders';

interface Props {
  orders: OrderSummary[];
  currency: string;
  /** Les groupes par date n'ont de sens que pour un tri par date. */
  ordering: string;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  isLoading: boolean;
}

export function OrdersMobileList({
  orders, currency, ordering, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading,
}: Props) {
  const t = useTranslations('orders.list');
  const tBuckets = useTranslations('orders.buckets');

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) return null;

  const byDate = ordering === '-created_at' || ordering === 'created_at';
  const grouped: Record<Bucket, OrderSummary[]> = { today: [], yesterday: [], this_week: [], older: [] };
  for (const o of orders) grouped[bucketOf(o.created_at)].push(o);
  const buckets = ordering === 'created_at' ? [...BUCKET_ORDER].reverse() : BUCKET_ORDER;

  return (
    <div className="flex flex-col gap-5">
      {!byDate && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {orders.map((order, i) => (
            <OrderRow key={order.id} order={order} bucket={bucketOf(order.created_at)} first={i === 0} currency={currency} />
          ))}
        </div>
      )}
      {byDate && buckets.map((bucket) => {
        const bucketOrders = grouped[bucket];
        if (bucketOrders.length === 0) return null;
        return (
          <section key={bucket} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              {tBuckets(bucket)}
              <span className="text-muted-foreground/60 normal-case font-normal tracking-normal ms-1.5">
                ({bucketOrders.length})
              </span>
            </h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {bucketOrders.map((order, i) => (
                <OrderRow key={order.id} order={order} bucket={bucket} first={i === 0} currency={currency} />
              ))}
            </div>
          </section>
        );
      })}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mx-auto flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {isFetchingNextPage ? '…' : t('load_more')}
        </button>
      )}
    </div>
  );
}
