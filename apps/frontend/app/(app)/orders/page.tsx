'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ClipboardPlus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useOrders, useOrdersInfinite } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { StatusFilters } from '@/components/orders/list/StatusFilters';
import { OrdersFilters } from '@/components/orders/list/OrdersFilters';
import { EmptyState } from '@/components/orders/list/EmptyState';
import { OrdersDesktopView } from '@/components/orders/list/OrdersDesktopView';
import { OrdersMobileList } from '@/components/orders/list/OrdersMobileList';
import { useOrdersPageState } from '@/components/orders/list/useOrdersPageState';

const PAGE_SIZE = 20;

function OrdersContent() {
  const t = useTranslations('orders.list');
  const isDesktop = useIsDesktop();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const state = useOrdersPageState();

  const { data: pageData, isLoading: pageLoading } = useOrders(
    { ...state.filters, page: state.urlPage },
    { enabled: isDesktop === true },
  );
  const {
    data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: mobileLoading,
  } = useOrdersInfinite(state.filters, { enabled: isDesktop === false });

  const totalCount = isDesktop === false
    ? (infiniteData?.pages[0]?.count ?? 0)
    : (pageData?.count ?? 0);
  const mobileOrders = infiniteData?.pages.flatMap(p => p.results) ?? [];
  const isLoading = isDesktop === undefined ? true : isDesktop ? pageLoading : mobileLoading;
  const hasLoaded = isDesktop === true ? !!pageData : isDesktop === false ? !!infiniteData : false;

  return (
    <>
      <TopBar
        title={t('topbar')}
        titleClassName="text-3xl"
        subtitle={hasLoaded ? t('count', { count: totalCount }) : undefined}
      />
      <div className="flex flex-col gap-4 p-4 pb-28">
        {(state.isFiltered || totalCount > 0 || isLoading) && (
          <>
            <StatusFilters value={state.statusFilter} onChange={state.handleStatusFilter} />
            <OrdersFilters
              search={state.searchInput}
              onSearchChange={state.setSearchInput}
              paymentFilter={state.paymentFilter}
              onPaymentFilterChange={state.handlePaymentFilter}
            />
          </>
        )}

        <Link
          href="/orders/new"
          className="lg:hidden flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm active:scale-95 transition-transform self-start"
        >
          <ClipboardPlus size={16} strokeWidth={2.4} />
          {t('new_order')}
        </Link>

        {!isLoading && hasLoaded && totalCount === 0 && (
          <>
            <EmptyState filtered={state.isFiltered} />
            {state.isFiltered && (
              <button onClick={state.clearFilters} className="text-xs text-primary font-medium self-center">
                {t('clear_filters')}
              </button>
            )}
          </>
        )}

        {isDesktop === true && (
          <OrdersDesktopView
            orders={pageData?.results ?? []}
            isLoading={pageLoading}
            total={totalCount}
            urlPage={state.urlPage}
            pageSize={PAGE_SIZE}
            currency={currency}
            onPrev={() => state.updateURL({ page: String(state.urlPage - 1) })}
            onNext={() => state.updateURL({ page: String(state.urlPage + 1) })}
          />
        )}
        {isDesktop === false && (
          <OrdersMobileList
            orders={mobileOrders}
            currency={currency}
            hasNextPage={!!hasNextPage}
            fetchNextPage={fetchNextPage}
            isFetchingNextPage={isFetchingNextPage}
            isLoading={mobileLoading}
          />
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
