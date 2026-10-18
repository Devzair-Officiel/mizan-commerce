'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { HEADER_LINK } from '@/components/form/fieldStyles';
import { SectionCard } from '@/components/ui/SectionCard';
import type { ZakatProfile } from '@/lib/hooks/useZakat';
import { CHOICE_ORDER } from '../choice/choiceCatalog';

const SHORT_VALUES = new Set(['stock_valuation', 'receivables_mode', 'debts_mode']);

/** Choix repris par le prochain calcul ; « Modifier » ouvre les réglages. */
export function ProfileChoicesCard({ profile }: { profile: ZakatProfile }) {
  const t = useTranslations('zakat');
  return (
    <SectionCard title={t('home.choices_title')}
      description={<><span className="lg:hidden">{t('home.choices_hint_short')}</span><span className="max-lg:hidden">{t('home.choices_hint')}</span></>}
      rightSlot={<Link href="/zakat/reglages" className={`${HEADER_LINK} relative after:absolute after:-inset-1.5`}>{t('common.modify')}</Link>}>
      <ul>
        {CHOICE_ORDER.map((name) => {
          const value = profile[name];
          const valueKey: string = `summary.value.${name}`;
          const shortKey: string = SHORT_VALUES.has(name) ? `summary.value_short.${name}` : valueKey;
          return (
            <li key={name} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:block lg:px-5 lg:py-3.25">
              <p className="text-xs text-muted-foreground lg:text-[0.8125rem]">
                <span className="lg:hidden">{t(`summary.label_short.${name}`)}</span>
                <span className="max-lg:hidden">{t(`summary.label.${name}`)}</span>
              </p>
              <p className="text-end text-sm font-semibold text-foreground lg:mt-0.5 lg:text-start">
                {value ? (
                  <><span className="lg:hidden">{t(shortKey, { value })}</span><span className="max-lg:hidden">{t(valueKey, { value })}</span></>
                ) : t('summary.missing')}
              </p>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
