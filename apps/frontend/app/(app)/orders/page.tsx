'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ClipboardPlus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useOrders, useOrdersInfinite, type OrderSummary } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { StatusFilters } from '@/components/orders/list/StatusFilters';
import { OrdersFilters } from '@/components/orders/list/OrdersFilters';
import { OrderRow } from '@/components/orders/list/OrderRow';
import { OrdersTable } from '@/components/orders/list/OrdersTable';
import { OrdersTableSkeleton } from '@/components/orders/list/OrdersTableSkeleton';
import { OrdersPagination } from '@/components/orders/list/OrdersPagination';
import { EmptyState } from '@/components/orders/list/EmptyState';
import { bucketOf } from '@/components/orders/list/bucket';
import { type Bucket, BUCKET_ORDER, type StatusFilterKey } from '@/components/orders/list/constants';

const PAGE_SIZE = 20;

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function OrdersContent() {
  const t = useTranslations('orders.list');
  const tBuckets = useTranslations('orders.buckets');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';

  const statusFilter = (searchParams.get('status') as StatusFilterKey) ?? '';
  const isDue = searchParams.get('due') === 'true';
  const isPaid = searchParams.get('payment_status') === 'paid';
  const urlSearch = searchParams.get('search') ?? '';
  const urlPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  const paymentFilter: 'all' | 'due' | 'paid' = isDue ? 'due' : isPaid ? 'paid' : 'all';

  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const updateURL = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, pathname, router]);

  // Sync debounced search → URL
  useEffect(() => {
    updateURL({ search: debouncedSearch || null, page: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleStatusFilter = (v: StatusFilterKey) => updateURL({ status: v || null, page: null });
  const handlePaymentFilter = (v: 'all' | 'due' | 'paid') => {
    updateURL({ due: v === 'due' ? 'true' : null, payment_status: v === 'paid' ? 'paid' : null, page: null });
  };
  const clearFilters = () => {
    setSearchInput('');
    router.replace(pathname);
  };

  const filters = {
    status: statusFilter || undefined,
    due: isDue || undefined,
    payment_status: isPaid ? ('paid' as const) : undefined,
    search: debouncedSearch || undefined,
  };

  const isFiltered = !!statusFilter || isDue || isPaid || !!debouncedSearch;

  // Desktop query
  const { data: pageData, isLoading: pageLoading } = useOrders({ ...filters, page: urlPage });
  const totalCount = pageData?.count ?? 0;

  // Mobile infinite query
  const { data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage } = useOrdersInfinite(filters);
  const mobileOrders = infiniteData?.pages.flatMap(p => p.results) ?? [];

  return (
    <>
      <TopBar
        title={t('topbar')}
        titleClassName="text-3xl"
        subtitle={pageData ? t('count', { count: totalCount }) : undefined}
      />
      <div className="flex flex-col gap-4 p-4 pb-28">
        {(isFiltered || totalCount > 0 || pageLoading) && (
          <>
            <StatusFilters value={statusFilter} onChange={handleStatusFilter} />
            <OrdersFilters
              search={searchInput}
              onSearchChange={setSearchInput}
              paymentFilter={paymentFilter}
              onPaymentFilterChange={handlePaymentFilter}
            />
          </>
        )}

        {/* Bouton nouvelle commande — mobile seulement */}
        <Link
          href="/orders/new"
          className="lg:hidden flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform self-start"
        >
          <ClipboardPlus size={16} strokeWidth={2.4} />
          {t('new_order')}
        </Link>

        {/* Empty state */}
        {!pageLoading && totalCount === 0 && (
          <>
            <EmptyState filtered={isFiltered} />
            {isFiltered && (
              <button onClick={clearFilters} className="text-xs text-primary font-medium self-center">
                {t('clear_filters')}
              </button>
            )}
          </>
        )}

        {/* DESKTOP (lg+) */}
        {pageLoading && <div className="hidden lg:block"><OrdersTableSkeleton /></div>}
        {!pageLoading && totalCount > 0 && (
          <div className="hidden lg:flex flex-col gap-3">
            <OrdersTable orders={pageData?.results ?? []} currency={currency} />
            <OrdersPagination
              total={totalCount}
              page={urlPage}
              pageSize={PAGE_SIZE}
              onPrev={() => updateURL({ page: String(urlPage - 1) })}
              onNext={() => updateURL({ page: String(urlPage + 1) })}
            />
          </div>
        )}

        {/* MOBILE */}
        {pageLoading && (
          <div className="lg:hidden flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        )}
        {!pageLoading && totalCount > 0 && (
          <div className="lg:hidden flex flex-col gap-5">
            {(() => {
              const grouped: Record<Bucket, OrderSummary[]> = { today: [], yesterday: [], this_week: [], older: [] };
              for (const o of mobileOrders) grouped[bucketOf(o.created_at)].push(o);
              return BUCKET_ORDER.map(bucket => {
                const orders = grouped[bucket];
                if (orders.length === 0) return null;
                return (
                  <section key={bucket} className="flex flex-col gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                      {tBuckets(bucket)}
                      <span className="text-muted-foreground/60 normal-case font-normal tracking-normal ms-1.5">
                        ({orders.length})
                      </span>
                    </h2>
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                      {orders.map((order, i) => (
                        <OrderRow key={order.id} order={order} bucket={bucket} first={i === 0} currency={currency} />
                      ))}
                    </div>
                  </section>
                );
              });
            })()}
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
        )}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersContent />
    </Suspense>
  );
}
