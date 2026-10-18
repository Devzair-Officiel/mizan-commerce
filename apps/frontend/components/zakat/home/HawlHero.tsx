'use client';

import { useTranslations } from 'next-intl';
import type { NextHawl } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import { HawlRing } from './HawlRing';
import { HeroFacts } from './HeroFacts';
import { HeroFactsMobile } from './HeroFactsMobile';
import type { HeroFacts as Facts } from './useHeroFacts';

/** Le jour J au centre de la page : anneau de l'année, dates grégorienne et hégirienne, repères. */
export function HawlHero({ next, facts, format }: { next: NextHawl; facts: Facts; format: ZakatFormat }) {
  const t = useTranslations('zakat.home');
  const hijri = format.hijri(next.hijri);
  return (
    <section aria-labelledby="zakat-next-hawl" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-4 py-4.5 lg:gap-9 lg:px-8 lg:py-7">
        <HawlRing next={next} />
        <div className="min-w-0">
          <h2 id="zakat-next-hawl" className="text-xs font-medium text-muted-foreground lg:text-[0.8125rem]">{t('next_label')}</h2>
          <p className="mt-1 text-[1.1875rem] leading-tight font-semibold tracking-tight text-foreground first-letter:uppercase lg:mt-1.5 lg:text-3xl">
            {format.longDate(next.date)}
          </p>
          <p className="mt-0.5 text-[0.84375rem] text-muted-foreground lg:mt-1 lg:text-base">
            <span className="lg:hidden">{hijri}</span>
            <span className="max-lg:hidden">{t('hijri_line', { calendar: next.hawl_calendar, date: hijri })}</span>
          </p>
          <HeroFacts facts={facts} format={format} />
        </div>
      </div>
      <HeroFactsMobile facts={facts} />
    </section>
  );
}
