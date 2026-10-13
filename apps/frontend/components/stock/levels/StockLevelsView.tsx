'use client';

import { useState, type ReactNode } from 'react';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useStockLevels, useStockLevelsInfinite, type StockLevel } from '@/lib/hooks/useStock';
import { QuickEntrySheet } from '../quick-entry/QuickEntrySheet';
import { StockEmptyState } from '../StockEmptyState';
import { StockStatCards } from '../StockStatCards';
import { STOCK_PANEL_ID } from '../StockTabs';
import { StockLevelsDesktopView } from './StockLevelsDesktopView';
import { StockLevelsFiltersMobile } from './StockLevelsFiltersMobile';
import { StockLevelsMobileList } from './StockLevelsMobileList';
import { StockLevelsToolbar } from './StockLevelsToolbar';
import { useStockLevelsState } from './useStockLevelsState';

const PAGE_SIZE = 20;

/** Onglet Niveaux : indicateurs, onglets, filtres, un format par ligne, entrée rapide. */
export function StockLevelsView({ tabs, currencyCode }: { tabs: ReactNode; currencyCode: string }) {
  const isDesktop = useIsDesktop();
  const state = useStockLevelsState();
  const [entry, setEntry] = useState<StockLevel | null>(null);

  const { data: pageData, isLoading: pageLoading } = useStockLevels(
    { ...state.filters, page: state.page }, { enabled: isDesktop === true },
  );
  const {
    data: infiniteData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: mobileLoading,
  } = useStockLevelsInfinite(state.filters, { enabled: isDesktop === false });

  const total = isDesktop === false ? (infiniteData?.pages[0]?.count ?? 0) : (pageData?.count ?? 0);
  const hasLoaded = isDesktop === true ? !!pageData : isDesktop === false ? !!infiniteData : false;

  return (
    <>
      <StockStatCards currency={currencyCode} active={state.activeCards} onToggle={state.toggleCard} />
      {tabs}
      <div id={STOCK_PANEL_ID} role="tabpanel" aria-labelledby="stock-tab-levels" className="flex flex-col gap-4 lg:gap-5">
        <div className="lg:hidden"><StockLevelsFiltersMobile state={state} /></div>
        <div className="hidden lg:block"><StockLevelsToolbar state={state} /></div>
        {hasLoaded && total === 0 && <StockEmptyState view="levels" filtered={state.isFiltered} onClear={state.clearFilters} />}
        {isDesktop === true && (
          <StockLevelsDesktopView state={state} levels={pageData?.results ?? []} isLoading={pageLoading}
            total={total} pageSize={PAGE_SIZE} currency={currencyCode} onEntry={setEntry} />
        )}
        {isDesktop === false && (
          <StockLevelsMobileList levels={infiniteData?.pages.flatMap((p) => p.results) ?? []} isLoading={mobileLoading}
            hasNextPage={!!hasNextPage} fetchNextPage={fetchNextPage} isFetchingNextPage={isFetchingNextPage} onEntry={setEntry} />
        )}
      </div>
      <QuickEntrySheet variant={entry} currencyCode={currencyCode} onClose={() => setEntry(null)} />
    </>
  );
}
