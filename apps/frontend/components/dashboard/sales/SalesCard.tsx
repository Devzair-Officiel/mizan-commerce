'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/components/ui/SectionCard';
import { useDashboardSales } from '@/lib/hooks/useDashboard';
import { useMe, useUpdateSalesPeriod } from '@/lib/hooks/useMe';
import { SalesChart } from './SalesChart';
import { SalesFooter } from './SalesFooter';
import { SalesHeadline } from './SalesHeadline';
import { SalesPeriodTabs } from './SalesPeriodTabs';
import { SalesTable } from './SalesTable';

/**
 * Bloc Ventes de l'accueil : 7 jours, 12 mois ou depuis l'ouverture. La période choisie est
 * gardée sur le compte ; la précédente reste affichée, atténuée, pendant le chargement.
 */
export function SalesCard({ currency }: { currency: string }) {
  const t = useTranslations('dashboard.sales');
  const period = useMe().data?.sales_period ?? '7d';
  const savePeriod = useUpdateSalesPeriod();
  const { data, isError, isPlaceholderData } = useDashboardSales(period);
  const [detail, setDetail] = useState(false);
  const tableId = useId();

  return (
    <SectionCard title={t('title')} wrap
      rightSlot={<SalesPeriodTabs value={period} onChange={(value) => savePeriod.mutate(value)} />}>
      {data ? (
        <div aria-busy={isPlaceholderData} className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="px-5 py-4.5">
            <SalesHeadline data={data} currency={currency} />
            <SalesChart data={data} currency={currency} />
            <SalesTable id={tableId} data={data} currency={currency} visible={detail && data.period === 'all'} />
          </div>
          <SalesFooter data={data} currency={currency} tableId={tableId} detail={detail} onToggleDetail={() => setDetail((v) => !v)} />
        </div>
      ) : isError ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">{t('load_failed')}</p>
      ) : (
        <div className="m-5 h-64 animate-pulse rounded-xl bg-muted" />
      )}
    </SectionCard>
  );
}
