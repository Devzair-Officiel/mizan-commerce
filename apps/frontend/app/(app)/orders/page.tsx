'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ListCreateButton } from '@/components/list/ListCreateButton';
import { useOrders, useOrdersInfinite } from '@/lib/hooks/useOrders';
import { useShop } from '@/lib/hooks/useShop';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { OrdersStatCards } from '@/components/orders/list/OrdersStatCards';
import { OrdersToolbar } from '@/components/orders/list/OrdersToolbar';
import { OrdersFiltersMobile } from '@/components/orders/list/OrdersFiltersMobile';
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
    { ...state.filters, page: state.page },
    { enabled: isDesktop === true },
  );
  const {
    data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: mobileLoading,
  } = useOrdersInfinite(state.filters, { enabled: isDesktop === false });

  const totalCount = isDesktop === false ? (infiniteData?.pages[0]?.count ?? 0) : (pageData?.count ?? 0);
  const mobileOrders = infiniteData?.pages.flatMap(p => p.results) ?? [];
  const isLoading = isDesktop === undefined ? true : isDesktop ? pageLoading : mobileLoading;
  const hasLoaded = isDesktop === true ? !!pageData : isDesktop === false ? !!infiniteData : false;

  return (
    <>
      <TopBar
        title={t('topbar')}
        subtitle={hasLoaded ? t('count', { count: totalCount }) : undefined}
        action={<ListCreateButton href="/orders/new" label={t('new_order')} />}
        hideSearch
      />
      <div className="flex flex-col gap-4 p-4 pb-28 lg:gap-5 lg:pt-0">
        <OrdersStatCards currency={currency} active={state.activeCards} onToggle={state.toggleCard} />
        {(state.isFiltered || totalCount > 0 || isLoading) && (
          <>
            <div className="lg:hidden"><OrdersFiltersMobile state={state} /></div>
            <div className="hidden lg:block"><OrdersToolbar state={state} /></div>
          </>
        )}

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
            page={state.page}
            pageSize={PAGE_SIZE}
            currency={currency}
            ordering={state.ordering}
            onSortChange={state.setOrdering}
            onPageChange={state.setPage}
          />
        )}
        {isDesktop === false && (
          <OrdersMobileList
            orders={mobileOrders}
            currency={currency}
            ordering={state.ordering}
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
