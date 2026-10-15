'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { useInvoices, useInvoicesInfinite } from '@/lib/hooks/useInvoices';
import { useShop } from '@/lib/hooks/useShop';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { InvoicesStatCards } from '@/components/invoices/list/InvoicesStatCards';
import { InvoicesToolbar } from '@/components/invoices/list/InvoicesToolbar';
import { InvoicesFiltersMobile } from '@/components/invoices/list/InvoicesFiltersMobile';
import { InvoicesDesktopView } from '@/components/invoices/list/InvoicesDesktopView';
import { InvoicesMobileList } from '@/components/invoices/list/InvoicesMobileList';
import { useInvoicesPageState } from '@/components/invoices/list/useInvoicesPageState';

function InvoicesContent() {
  const t = useTranslations('invoices.list');
  const desktop = useIsDesktop();
  const { data: shop } = useShop();
  const state = useInvoicesPageState();
  const page = useInvoices({ ...state.filters, page: state.page }, { enabled: desktop === true });
  const mobile = useInvoicesInfinite(state.filters, { enabled: desktop === false });
  const data = desktop === false ? mobile.data?.pages[0] : page.data;
  const loading = desktop === undefined || (desktop ? page.isLoading : mobile.isLoading);
  const error = desktop ? page.isError : mobile.isError;
  const total = data?.count ?? 0;
  return <>
    <TopBar title={t('title')} subtitle={data ? t('count', { count: total }) : undefined} hideSearch />
    <div className="flex flex-col gap-4 p-4 pb-28 lg:gap-5 lg:pt-0">
      <InvoicesStatCards state={state} currency={shop?.currency ?? 'EUR'} />
      {desktop === true && <InvoicesToolbar state={state} />}
      {desktop === false && <InvoicesFiltersMobile state={state} />}
      {error && <p role="alert" className="text-sm text-destructive">{t('load_error')}</p>}
      {!loading && !error && !total && <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-muted"><FileText size={26} className="text-muted-foreground" /></span>
        <p className="text-sm font-semibold">{t(state.isFiltered ? 'empty_filtered' : 'empty_title')}</p>
        <p className="text-xs text-muted-foreground">{t('empty_body')}</p>
        {state.isFiltered && <button type="button" onClick={state.clearFilters} className="h-11 text-sm font-medium text-primary whitespace-nowrap">{t('clear_filters')}</button>}
      </div>}
      {desktop === true && <InvoicesDesktopView invoices={page.data?.results ?? []} loading={loading} total={total} state={state} />}
      {desktop === false && <InvoicesMobileList invoices={mobile.data?.pages.flatMap(p => p.results) ?? []} ordering={state.ordering}
        loading={loading} hasNextPage={!!mobile.hasNextPage} fetching={mobile.isFetchingNextPage} loadMore={() => mobile.fetchNextPage()} />}
    </div>
  </>;
}
export default function InvoicesPage() {
  return <Suspense><InvoicesContent /></Suspense>;
}
