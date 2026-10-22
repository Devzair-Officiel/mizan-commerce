'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { StockHeaderActions } from '@/components/stock/StockHeaderActions';
import { StockTabs, type StockTab } from '@/components/stock/StockTabs';
import { StockLevelsView } from '@/components/stock/levels/StockLevelsView';
import { StockMovementsView } from '@/components/stock/movements/StockMovementsView';
import { useFormatMoney } from '@/lib/hooks/useFormat';
import { useShop } from '@/lib/hooks/useShop';
import { useStockLevelsSummary, useStockMovements } from '@/lib/hooks/useStock';

/** Onglet dans l'URL : `?tab=mouvements` ; Niveaux par défaut, sans paramètre. */
const MOVEMENTS_PARAM = 'mouvements';

function StockContent() {
  const t = useTranslations('stock.page');
  const router = useRouter();
  const tab: StockTab = useSearchParams().get('tab') === MOVEMENTS_PARAM ? 'movements' : 'levels';
  const { data: shop } = useShop();
  const currency = shop?.currency ?? 'EUR';
  const formatMoney = useFormatMoney();
  const { data: summary } = useStockLevelsSummary();
  const { data: movements } = useStockMovements({ pageSize: 1 });

  // Changer d'onglet repart d'une liste sans filtre : les filtres ne valent que pour leur onglet.
  const changeTab = (next: StockTab) => router.push(next === 'movements' ? `/stock?tab=${MOVEMENTS_PARAM}` : '/stock', { scroll: false });
  const tabs = (
    <StockTabs active={tab} counts={{ levels: summary?.formats, movements: movements?.count }} onChange={changeTab} />
  );

  return (
    <>
      <TopBar
        title={t('title')}
        subtitle={summary ? t('subtitle', { count: summary.formats, value: formatMoney(summary.purchase_value, currency) }) : undefined}
        action={<StockHeaderActions exportable={tab === 'levels'} />}
        hideSearch
      />
      <div className="flex flex-col gap-4 p-4 pb-28 lg:gap-5 lg:pt-0">
        {tab === 'levels'
          ? <StockLevelsView tabs={tabs} currencyCode={currency} />
          : <StockMovementsView tabs={tabs} />}
      </div>
    </>
  );
}

export default function StockPage() {
  return (
    <Suspense>
      <StockContent />
    </Suspense>
  );
}
