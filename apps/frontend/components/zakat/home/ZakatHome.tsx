'use client';

import { useTranslations } from 'next-intl';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useZakatCalculations, useZakatProfile, useZakatSources } from '@/lib/hooks/useZakat';
import { HomeContent } from './HomeContent';
import { StartButton } from './StartButton';

/** Accueil de la zakat : le jour J au centre, une seule action (desktop : en-tête ; mobile : au pouce). */
export function ZakatHome() {
  const t = useTranslations('zakat');
  const isDesktop = useIsDesktop();
  const profile = useZakatProfile();
  const list = useZakatCalculations();
  const sources = useZakatSources();
  const failed = profile.isError || list.isError || sources.isError;
  const ready = profile.data && list.data && sources.data
    ? { profile: profile.data, rows: list.data.results, sources: sources.data }
    : null;
  const next = profile.data?.next_hawl ?? null;
  const doneCount = list.data?.results.find((row) => row.id === next?.calculation_id)?.current_step ?? 0;
  const retry = () => { void profile.refetch(); void list.refetch(); void sources.refetch(); };

  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('home.title')} subtitle={isDesktop ? t('home.subtitle') : undefined} hideSearch
        action={ready && <StartButton next={next} doneCount={doneCount} className="hidden h-11 px-5 text-sm lg:inline-flex" />} />
      <div className="px-4 pt-2 pb-28 lg:pt-0 lg:pb-8">
        {failed ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-sm">
            <p>{t('home.load_error')}</p>
            <Button type="button" variant="outline" onClick={retry} className="h-11 rounded-full px-5">{t('common.retry')}</Button>
          </div>
        ) : ready ? (
          <HomeContent {...ready} />
        ) : (
          <SectionsSkeleton sections={[2, 2, 5]} />
        )}
      </div>
      {ready && !failed && (
        <FloatingActionBar variant="button">
          <StartButton next={next} doneCount={doneCount} className="h-12 w-full text-[0.9375rem] shadow-lg" />
        </FloatingActionBar>
      )}
    </div>
  );
}
