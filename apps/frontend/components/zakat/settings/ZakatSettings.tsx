'use client';

import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { SectionsSkeleton } from '@/components/ui/SectionsSkeleton';
import { useBackOr } from '@/lib/hooks/useBackOr';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';
import { useShop } from '@/lib/hooks/useShop';
import { useZakatProfile } from '@/lib/hooks/useZakat';
import { SettingsContent } from './SettingsContent';
import { useProfileAutosave } from './useProfileAutosave';

/** `/zakat/reglages` : point de départ de chaque nouveau calcul, enregistré au fil de la saisie (Q1). */
export function ZakatSettings() {
  const t = useTranslations('zakat');
  const isDesktop = useIsDesktop();
  const back = useBackOr('/zakat');
  const profile = useZakatProfile();
  const shop = useShop();
  const autosave = useProfileAutosave();
  const retry = () => { void profile.refetch(); void shop.refetch(); };

  return (
    <div className="mx-auto w-full max-w-280">
      <TopBar title={t('settings.title')} shortTitle={t('settings.short_title')}
        subtitle={isDesktop ? t('settings.subtitle') : undefined}
        back backLabel={t('settings.back')} onBack={back} hideSearch />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8 lg:pt-0">
        <p className="text-sm leading-normal text-muted-foreground lg:hidden">{t('settings.subtitle')}</p>
        {profile.isError || shop.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-sm">
            <p>{t('home.load_error')}</p>
            <Button type="button" variant="outline" onClick={retry} className="h-11 rounded-full px-5">{t('common.retry')}</Button>
          </div>
        ) : profile.data && shop.data ? (
          <SettingsContent profile={profile.data} currency={shop.data.currency} autosave={autosave} />
        ) : (
          <SectionsSkeleton sections={[2, 3]} />
        )}
      </div>
    </div>
  );
}
