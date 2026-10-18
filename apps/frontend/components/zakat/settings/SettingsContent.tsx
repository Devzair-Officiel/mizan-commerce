'use client';

import { useTranslations } from 'next-intl';
import { FORM_COLUMN, FORM_COLUMNS } from '@/components/form/fieldStyles';
import type { ZakatProfile } from '@/lib/hooks/useZakat';
import { cn } from '@/lib/utils';
import { BasisProvider } from '../basis/BasisProvider';
import { CHOICE_ORDER } from '../choice/choiceCatalog';
import { ChoiceSection } from '../choice/ChoiceSection';
import { PRICE_STALE_DAYS, daysSince } from '../home/daysSince';
import { NisabPriceCard } from '../steps/NisabPriceCard';
import { ShareCard } from '../steps/ShareCard';
import { useZakatFormat } from '../useZakatFormat';
import { SettingsHawlCard } from './SettingsHawlCard';
import type { ProfileAutosave } from './useProfileAutosave';

function PriceAge({ updatedAt }: { updatedAt: string }) {
  const t = useTranslations('zakat.common');
  const days = daysSince(updatedAt);
  return (
    <p className={cn('text-[0.8125rem]', days > PRICE_STALE_DAYS ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
      {t('price_age', { days })}
    </p>
  );
}

interface SettingsContentProps {
  profile: ZakatProfile;
  /** Devise de la boutique. */
  currency: string;
  autosave: ProfileAutosave;
}

/**
 * Desktop : jour J et choix d'avis à gauche, seuil et part à droite (gabarit § 11).
 * Mobile : jour J, choix, seuil, part. Les champs repartent du serveur à chaque `resetKey`.
 */
export function SettingsContent({ profile, currency, autosave }: SettingsContentProps) {
  const t = useTranslations('zakat.settings');
  const format = useZakatFormat(currency);
  const { save, resetKey } = autosave;

  return (
    <BasisProvider choices={profile}>
      <div key={resetKey} className={FORM_COLUMNS}>
        <div className={FORM_COLUMN}>
          <SettingsHawlCard profile={profile} save={save} format={format} />
          <div className="flex flex-col gap-4 max-lg:order-1 lg:gap-5">
            <div className="max-lg:mt-2">
              <h2 className="text-base font-semibold text-foreground">{t('choices_title')}</h2>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">{t('choices_hint')}</p>
            </div>
            {CHOICE_ORDER.map((name) => (
              <ChoiceSection key={name} name={name} value={profile[name]} isLatest
                onChange={(value) => save({ [name]: value }, true)} />
            ))}
          </div>
        </div>
        <div className={FORM_COLUMN}>
          {profile.nisab_method && (
            <div className="max-lg:order-2">
              <NisabPriceCard metal={profile.nisab_method} price={profile.nisab_unit_price}
                threshold={profile.nisab_threshold} format={format}
                onSave={(amount) => save({ nisab_unit_price: amount })}>
                {profile.nisab_price_updated_at && <PriceAge updatedAt={profile.nisab_price_updated_at} />}
              </NisabPriceCard>
            </div>
          )}
          <div className="max-lg:order-3">
            <ShareCard share={profile.ownership_share} format={format}
              onSave={(amount) => save({ ownership_share: amount })} />
          </div>
        </div>
      </div>
    </BasisProvider>
  );
}
