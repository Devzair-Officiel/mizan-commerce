'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { ListCreateButton } from '@/components/list/ListCreateButton';
import { UsageBanner } from '@/components/subscription/UsageBanner';
import { useProductsInfinite, useProductsPage } from '@/lib/hooks/useProducts';
import { useCatalogKind } from '@/lib/hooks/useCatalogKind';
import { useShop } from '@/lib/hooks/useShop';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { ProductsStatCards } from '@/components/products/list/ProductsStatCards';
import { ProductsToolbar } from '@/components/products/list/ProductsToolbar';
import { ProductsFiltersMobile } from '@/components/products/list/ProductsFiltersMobile';
import { ProductsEmptyState } from '@/components/products/list/ProductsEmptyState';
import { ProductsDesktopView } from '@/components/products/list/ProductsDesktopView';
import { ProductsMobileList } from '@/components/products/list/ProductsMobileList';
import { useProductsPageState } from '@/components/products/list/useProductsPageState';

const PAGE_SIZE = 20;

function ProductsContent() {
  const t = useTranslations('articles.list');
  const isDesktop = useIsDesktop();
  const kind = useCatalogKind();
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const state = useProductsPageState(kind);

  const { data: pageData, isLoading: pageLoading } = useProductsPage(
    { ...state.filters, page: state.page },
    { enabled: isDesktop === true },
  );
  const {
    data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: mobileLoading,
  } = useProductsInfinite(state.filters, { enabled: isDesktop === false });

  const totalCount = isDesktop === false ? (infiniteData?.pages[0]?.count ?? 0) : (pageData?.count ?? 0);
  const isLoading = isDesktop === undefined ? true : isDesktop ? pageLoading : mobileLoading;
  const hasLoaded = isDesktop === true ? !!pageData : isDesktop === false ? !!infiniteData : false;

  return (
    <>
      <TopBar
        title={t('title', { kind })}
        subtitle={hasLoaded ? t('count', { kind, count: totalCount }) : undefined}
        action={<ListCreateButton href="/products/new" label={t('new_cta', { kind })} usage="products" />}
        hideSearch
      />
      <div className="flex flex-col gap-4 p-4 pb-28 lg:gap-5 lg:pt-0">
        <UsageBanner usageKey="products" />
        <ProductsStatCards kind={kind} active={state.activeCards} onToggle={state.toggleCard} />
        {/* La recherche reste visible même quand elle ne trouve rien. */}
        <div className="lg:hidden"><ProductsFiltersMobile state={state} /></div>
        <div className="hidden lg:block"><ProductsToolbar state={state} /></div>

        {!isLoading && hasLoaded && totalCount === 0 && (
          <ProductsEmptyState kind={kind} filtered={state.isFiltered} onClear={state.clearFilters} />
        )}
        {isDesktop === true && (
          <ProductsDesktopView
            kind={kind}
            products={pageData?.results ?? []}
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
          <ProductsMobileList
            products={infiniteData?.pages.flatMap((p) => p.results) ?? []}
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

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsContent />
    </Suspense>
  );
}
