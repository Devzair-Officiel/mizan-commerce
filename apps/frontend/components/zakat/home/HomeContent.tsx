'use client';

import { useTranslations } from 'next-intl';
import { FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import type { ZakatListRow, ZakatProfile, ZakatSources } from '@/lib/hooks/useZakat';
import { BasisLink } from '../basis/BasisLink';
import { BasisProvider } from '../basis/BasisProvider';
import { useZakatFormat } from '../useZakatFormat';
import { HawlEmpty } from './HawlEmpty';
import { HawlHero } from './HawlHero';
import { HistoryCard } from './HistoryCard';
import { KnownCard } from './KnownCard';
import { ProfileChoicesCard } from './ProfileChoicesCard';
import { useHeroFacts } from './useHeroFacts';

interface HomeContentProps {
  profile: ZakatProfile;
  rows: ZakatListRow[];
  sources: ZakatSources;
}

/** Desktop : le jour J en tête, puis deux colonnes (connu et historique ; choix et méthode). Mobile : connu, choix, historique. */
export function HomeContent({ profile, rows, sources }: HomeContentProps) {
  const t = useTranslations('zakat.home');
  const tb = useTranslations('zakat.basis');
  const format = useZakatFormat(sources.currency);
  const facts = useHeroFacts(profile, rows, format);
  const next = profile.next_hawl;

  return (
    <BasisProvider choices={profile}>
      <div className="flex flex-col gap-4 lg:gap-5">
        {next ? <HawlHero next={next} facts={facts} format={format} /> : <HawlEmpty />}
        <div className={FORM_COLUMNS}>
          <div className={FORM_COLUMN}>
            <KnownCard sources={sources} format={format} />
            <div className="max-lg:order-1">
              <HistoryCard rows={rows} calendar={next?.hawl_calendar ?? profile.calendar ?? 'hijri'} format={format} />
            </div>
          </div>
          <div className={FORM_COLUMN}>
            <ProfileChoicesCard profile={profile} />
            <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5 max-lg:hidden">
              <h2 className="text-[0.9375rem] font-semibold text-foreground">{t('how_title')}</h2>
              <p className="text-[0.8125rem] leading-normal text-muted-foreground">{t('how_text')}</p>
              <BasisLink view="index" label={tb('see_rules')} icon={false} className="min-h-6 text-[0.84375rem]" />
            </section>
          </div>
        </div>
        <BasisLink view="index" label={tb('see_rules')} className="lg:hidden" />
        <p className="max-w-prose text-xs leading-normal text-muted-foreground lg:mt-2 lg:text-[0.78125rem]">
          <span className="lg:hidden">{t('footer_short')}</span>
          <span className="max-lg:hidden">{t('footer')}</span>
        </p>
      </div>
    </BasisProvider>
  );
}
