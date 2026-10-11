'use client';

import type { ReactNode } from 'react';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useStockMovements, useStockMovementsInfinite } from '@/lib/hooks/useStock';
import { StockEmptyState } from '../StockEmptyState';
import { STOCK_PANEL_ID } from '../StockTabs';
import { StockMovementsDesktopView } from './StockMovementsDesktopView';
import { StockMovementsFiltersMobile } from './StockMovementsFiltersMobile';
import { StockMovementsMobileList } from './StockMovementsMobileList';
import { StockMovementsToolbar } from './StockMovementsToolbar';
import { useStockMovementsState } from './useStockMovementsState';

const PAGE_SIZE = 20;

/** Onglet Mouvements : onglets, filtres, historique daté, pagination ou « Charger plus ». */
export function StockMovementsView({ tabs }: { tabs: ReactNode }) {
  const isDesktop = useIsDesktop();
  const state = useStockMovementsState();

  const { data: pageData, isLoading: pageLoading } = useStockMovements(
    { ...state.filters, page: state.page }, { enabled: isDesktop === true },
  );
  const {
    data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: mobileLoading,
  } = useStockMovementsInfinite(state.filters, { enabled: isDesktop === false });

  const total = isDesktop === false ? (infiniteData?.pages[0]?.count ?? 0) : (pageData?.count ?? 0);
  const hasLoaded = isDesktop === true ? !!pageData : isDesktop === false ? !!infiniteData : false;

  return (
    <>
      {tabs}
      <div id={STOCK_PANEL_ID} role="tabpanel" aria-labelledby="stock-tab-movements" className="flex flex-col gap-4 lg:gap-5">
        <div className="lg:hidden"><StockMovementsFiltersMobile state={state} /></div>
        <div className="hidden lg:block"><StockMovementsToolbar state={state} /></div>
        {hasLoaded && total === 0 && <StockEmptyState view="movements" filtered={state.isFiltered} onClear={state.clearFilters} />}
        {isDesktop === true && (
          <StockMovementsDesktopView state={state} movements={pageData?.results ?? []} isLoading={pageLoading}
            total={total} pageSize={PAGE_SIZE} />
        )}
        {isDesktop === false && (
          <StockMovementsMobileList movements={infiniteData?.pages.flatMap((p) => p.results) ?? []} isLoading={mobileLoading}
            hasNextPage={!!hasNextPage} fetchNextPage={fetchNextPage} isFetchingNextPage={isFetchingNextPage} />
        )}
      </div>
    </>
  );
}
