'use client';

import { useTranslations } from 'next-intl';
import type { DoubtfulOption, FollowUpItem } from '@/lib/hooks/useZakatFollowUps';
import type { ZakatFormat } from '../useZakatFormat';

/**
 * Ce que chaque option D4 compte, en une phrase : les calculs retenus, ceux qui ne le sont pas
 * (sous le seuil, incomplets), et le calcul unique pour « une seule année ».
 */
export function useOptionTexts(item: FollowUpItem, format: ZakatFormat): Record<DoubtfulOption, string> {
  const t = useTranslations('zakat.followup.option_text');
  const years = (list: FollowUpItem['years']) => format.list(list.map((y) => String(y.hawl_year)));
  const counted = item.years.filter((y) => y.excluded === null);
  const below = item.years.filter((y) => y.excluded === 'below_nisab');
  const incomplete = item.years.filter((y) => y.excluded === 'incomplete');
  const all = [
    counted.length > 0 ? t('all_years', { count: counted.length, years: years(counted) }) : t('all_years_none'),
    below.length > 0 ? t('below', { count: below.length, years: years(below) }) : null,
    incomplete.length > 0 ? t('incomplete', { count: incomplete.length, years: years(incomplete) }) : null,
  ];
  const last = item.years[item.years.length - 1];
  const year = String(last?.hawl_year ?? item.hawl_year);
  let one = t('one_year', { year });
  if (last?.excluded === 'below_nisab') one = t('one_year_below', { year });
  if (last?.excluded === 'incomplete') one = t('one_year_incomplete', { year });
  return {
    all_years: all.filter((s): s is string => s !== null).join(' '),
    one_year: one,
    new_year: t('new_year'),
  };
}
