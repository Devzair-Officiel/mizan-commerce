'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FloatingActionBar } from '@/components/layout/FloatingActionBar';
import { TopBar } from '@/components/layout/TopBar';
import { Button, buttonVariants } from '@/components/ui/button';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useZakatProfile } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import { useZakatFormat } from '../useZakatFormat';
import { stepHref } from '../wizard/stepNav';
import { useStartZakat } from './useStartZakat';

/** `/zakat/new` : le jour J du prochain calcul et un bouton ; rien n'est créé avant le clic (Q2). */
export function NewZakat() {
  const t = useTranslations('zakat');
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { data: profile, isLoading } = useZakatProfile();
  const { start, pending } = useStartZakat();
  // La devise n'intervient pas ici : seules les dates sont mises en forme.
  const format = useZakatFormat('EUR');
  const next = profile?.next_hawl ?? null;
  const existing = next?.calculation_id ?? null;
  const action = existing ? (
    <Link href={stepHref(existing, 0)} className={cn(buttonVariants(), 'h-12 w-full rounded-full text-[0.9375rem] font-semibold shadow-lg lg:h-11 lg:w-auto lg:px-5 lg:text-sm lg:shadow-none')}>
      {t('common.year_taken_open')}
    </Link>
  ) : (
    <Button type="button" onClick={start} disabled={pending || isLoading}
      className="h-12 w-full rounded-full text-[0.9375rem] font-semibold shadow-lg lg:h-11 lg:w-auto lg:px-5 lg:text-sm lg:shadow-none">
      {pending ? t('home.starting') : t('new.start')}
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('new.title')} subtitle={isDesktop ? t('new.subtitle') : undefined}
        back backLabel={t('wizard.back')} onBack={() => router.push('/zakat')} hideSearch />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-28 lg:max-w-xl lg:gap-5 lg:pt-0 lg:pb-8">
        {isLoading ? <SectionsSkeleton sections={[2]} /> : (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-[0.8125rem] font-medium text-muted-foreground">{t('new.hawl_label')}</h2>
            {next ? (
              <>
                <p className="mt-1 text-xl font-semibold tracking-tight text-foreground first-letter:uppercase">{format.longDate(next.date)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{format.hijri(next.hijri)}</p>
                {existing && <p className="mt-3 text-sm text-foreground">{t('new.exists', { year: String(next.hawl_year) })}</p>}
              </>
            ) : (
              <p className="mt-1 text-sm leading-normal text-foreground">{t('new.no_hawl')}</p>
            )}
          </section>
        )}
        <p className="text-sm text-muted-foreground lg:hidden">{t('new.subtitle')}</p>
        <div className="max-lg:hidden">{action}</div>
      </div>
      <FloatingActionBar variant="button">{action}</FloatingActionBar>
    </div>
  );
}
