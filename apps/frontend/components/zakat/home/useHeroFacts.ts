'use client';

import { useTranslations } from 'next-intl';
import type { ZakatListRow, ZakatProfile } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import { daysSince, PRICE_STALE_DAYS } from './daysSince';

export interface HeroFacts {
  threshold: { label: string; value: string; note: string; stale: boolean };
  /** Fiche de la prochaine année de hawl, si elle est commencée. */
  current: ZakatListRow | null;
  /** Fiche précédente la plus récente. */
  last: { id: string; year: string; value: string; note: string } | null;
  /** « Rappel par e-mail, 7 jours avant », selon le réglage. */
  reminder: string;
}

/** Repères du bandeau : seuil et âge du prix du gramme, calcul en cours, dernière zakat, rappel. */
export function useHeroFacts(profile: ZakatProfile, rows: ZakatListRow[], format: ZakatFormat): HeroFacts {
  const t = useTranslations('zakat');
  const currentId = profile.next_hawl?.calculation_id ?? null;
  const current = rows.find((row) => row.id === currentId) ?? null;
  const previous = rows.find((row) => row.id !== currentId) ?? null;

  const method = profile.nisab_method;
  const updatedAt = profile.nisab_unit_price ? profile.nisab_price_updated_at : null;
  const age = updatedAt ? daysSince(updatedAt) : null;
  const priceNote = !profile.nisab_unit_price ? t('common.price_missing') : age === null ? '' : t('common.price_age', { days: age });

  return {
    threshold: {
      label: method ? t('home.fact_threshold', { nisab: t('common.nisab_name', { method }) }) : t('summary.label.nisab_method'),
      value: profile.nisab_threshold ? format.money(profile.nisab_threshold) : '—',
      note: method ? priceNote : t('summary.missing'),
      stale: !method || !profile.nisab_unit_price || (age !== null && age > PRICE_STALE_DAYS),
    },
    current,
    last: previous && {
      id: previous.id,
      year: String(previous.hawl_year),
      value: previous.totals.zakat_total ? format.money(previous.totals.zakat_total) : t(`status.${previous.totals.status}`),
      note: t('home.modified_on', { date: format.instantDate(previous.updated_at) }),
    },
    reminder: t('home.reminder', { enabled: String(profile.reminder_email_enabled) }),
  };
}
