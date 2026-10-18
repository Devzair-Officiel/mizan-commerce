'use client';

import { useTranslations } from 'next-intl';
import { isZeroDecimal } from '@/lib/decimal';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import type { ZakatFormat } from '../useZakatFormat';
import { StepLink } from '../wizard/StepLink';
import { HeroIncomplete } from './HeroIncomplete';
import { HERO_BOX, HERO_EYEBROW, HERO_LEAD, HERO_META, HERO_TITLE } from './heroStyles';
import { ThresholdGauge } from './ThresholdGauge';

const OTHER_STEP = 4;

interface ResultHeroProps {
  calc: ZakatCalculation;
  format: ZakatFormat;
  onGo: (step: number) => void;
}

/** Le verdict avant le montant : zakat estimée, ou « pas de zakat » avec la base sous le seuil. */
export function ResultHero({ calc, format, onGo }: ResultHeroProps) {
  const t = useTranslations('zakat.result');
  const { totals } = calc;
  if (totals.status !== 'above_nisab' && totals.status !== 'below_nisab') return <HeroIncomplete calc={calc} onGo={onGo} />;

  const above = totals.status === 'above_nisab';
  const amounts = { base: format.money(totals.nisab_compared_amount ?? '0'), threshold: format.money(totals.nisab_threshold ?? '0') };
  const rate = { calendar: calc.choices.calendar ?? calc.hawl_calendar, date: format.date(calc.reference_date) };
  const later = totals.zakat_on_collection;
  const prefix = above ? 'above' : 'below';

  return (
    <section aria-labelledby="zakat-result-verdict"
      className={cn(HERO_BOX, above ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground')}>
      <div className="min-w-0">
        <h2 id="zakat-result-verdict" className={cn(HERO_EYEBROW, !above && 'text-muted-foreground')}>{t(`${prefix}_eyebrow`)}</h2>
        {above ? (
          <p className="mt-2 text-[2.75rem] leading-none font-bold tracking-tight tabular-nums lg:text-[3.25rem]">
            {format.money(totals.zakat_total ?? '0')}
          </p>
        ) : (
          <p className={HERO_TITLE}>{t('below_title')}</p>
        )}
        <p className={HERO_LEAD}>
          <span className="max-lg:hidden">{t(`${prefix}_text`, amounts)}</span>
          <span className="lg:hidden">{t(`${prefix}_text_short`, amounts)}</span>
        </p>
        {above ? (
          <p className={cn(HERO_META, 'opacity-85 lg:opacity-100')}>
            <span className="max-lg:hidden">{t('above_rate', rate)}</span>
            <span className="lg:hidden">{t('above_rate_short', rate)}</span>
            {later !== null && !isZeroDecimal(later) && (
              <span className="mt-1 block">{t('on_collection', { later: format.money(later), now: format.money(totals.zakat_now ?? '0') })}</span>
            )}
          </p>
        ) : (
          <p className={cn(HERO_META, 'text-muted-foreground')}>
            {t.rich('below_hint', {
              link: (chunks) => (
                <StepLink id={calc.id} step={OTHER_STEP} onGo={onGo} className="font-semibold text-primary underline-offset-2 hover:underline">
                  {chunks}
                </StepLink>
              ),
            })}
          </p>
        )}
      </div>
      <ThresholdGauge above={above} ratio={totals.nisab_ratio} base={amounts.base} threshold={amounts.threshold} />
    </section>
  );
}
