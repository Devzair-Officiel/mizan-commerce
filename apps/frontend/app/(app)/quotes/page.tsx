'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { ListCreateButton } from '@/components/list/ListCreateButton';
import { QuotesDesktopView } from '@/components/quotes/QuotesDesktopView';
import { QuotesMobileList } from '@/components/quotes/QuotesMobileList';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useQuotes, useQuotesInfinite } from '@/lib/hooks/useQuotes';

/** Liste simple des devis (URS-111) : ni filtre ni tri en 6b, ordre du serveur. */
export default function QuotesPage() {
  const t = useTranslations('quotes');
  const desktop = useIsDesktop();
  const [pageNumber, setPageNumber] = useState(1);
  const page = useQuotes(pageNumber, { enabled: desktop === true });
  const mobile = useQuotesInfinite({ enabled: desktop === false });
  const data = desktop === false ? mobile.data?.pages[0] : page.data;
  const loading = desktop === undefined || (desktop ? page.isLoading : mobile.isLoading);
  const error = desktop ? page.isError : mobile.isError;
  const total = data?.count ?? 0;
  return <>
    <TopBar title={t('title')} subtitle={data ? t('count', { count: total }) : undefined} hideSearch
      action={<ListCreateButton href="/quotes/new" label={t('create')} />} />
    <div className="flex flex-col gap-4 p-4 pb-28 lg:gap-5 lg:pt-0">
      {error && <p role="alert" className="text-sm text-destructive">{t('load_error')}</p>}
      {!loading && !error && !total && <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-muted"><FileText size={26} className="text-muted-foreground" /></span>
        <p className="text-sm font-semibold">{t('empty_title')}</p>
        <p className="text-xs text-muted-foreground">{t('empty_body')}</p>
      </div>}
      {desktop === true && <QuotesDesktopView quotes={page.data?.results ?? []} loading={loading} total={total} page={pageNumber} onPageChange={setPageNumber} />}
      {desktop === false && <QuotesMobileList quotes={mobile.data?.pages.flatMap(p => p.results) ?? []} loading={loading}
        hasNextPage={!!mobile.hasNextPage} fetching={mobile.isFetchingNextPage} loadMore={() => mobile.fetchNextPage()} />}
    </div>
  </>;
}
