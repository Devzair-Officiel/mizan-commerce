'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ListCreateButton } from '@/components/list/ListCreateButton';
import { useCustomersInfinite, useCustomersList } from '@/lib/hooks/useCustomers';
import { useShop } from '@/lib/hooks/useShop';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { CustomersStatCards } from '@/components/customers/list/CustomersStatCards';
import { CustomersToolbar } from '@/components/customers/list/CustomersToolbar';
import { CustomersFiltersMobile } from '@/components/customers/list/CustomersFiltersMobile';
import { CustomersEmptyState } from '@/components/customers/list/CustomersEmptyState';
import { CustomersDesktopView } from '@/components/customers/list/CustomersDesktopView';
import { CustomersMobileList } from '@/components/customers/list/CustomersMobileList';
import { useCustomersPageState } from '@/components/customers/list/useCustomersPageState';

const PAGE_SIZE = 20;

function CustomersContent() {
  const t = useTranslations('customers.list');
  const isDesktop = useIsDesktop();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const state = useCustomersPageState();

  const { data: pageData, isLoading: pageLoading } = useCustomersList(
    { ...state.filters, page: state.page },
    { enabled: isDesktop === true },
  );
  const {
    data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: mobileLoading,
  } = useCustomersInfinite(state.filters, { enabled: isDesktop === false });

  const totalCount = isDesktop === false ? (infiniteData?.pages[0]?.count ?? 0) : (pageData?.count ?? 0);
  const isLoading = isDesktop === undefined ? true : isDesktop ? pageLoading : mobileLoading;
  const hasLoaded = isDesktop === true ? !!pageData : isDesktop === false ? !!infiniteData : false;

  return (
    <>
      <TopBar
        title={t('title')}
        subtitle={hasLoaded ? t('count', { count: totalCount }) : undefined}
        action={<ListCreateButton href="/customers/new" label={t('new_cta')} />}
        hideSearch
      />
      <div className="flex flex-col gap-4 p-4 pb-28 lg:gap-5 lg:pt-0">
        <CustomersStatCards currency={currency} active={state.activeCards} onToggle={state.toggleCard} />
        {/* La recherche reste visible même quand elle ne trouve rien. */}
        <div className="lg:hidden"><CustomersFiltersMobile state={state} /></div>
        <div className="hidden lg:block"><CustomersToolbar state={state} /></div>

        {!isLoading && hasLoaded && totalCount === 0 && (
          <CustomersEmptyState filtered={state.isFiltered} onClear={state.clearFilters} />
        )}
        {isDesktop === true && (
          <CustomersDesktopView
            customers={pageData?.results ?? []}
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
          <CustomersMobileList
            customers={infiniteData?.pages.flatMap((p) => p.results) ?? []}
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

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersContent />
    </Suspense>
  );
}
