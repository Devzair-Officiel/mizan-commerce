'use client';

import { useTranslations } from 'next-intl';
import { compareDecimal, isZeroDecimal } from '@/lib/decimal';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';

/** Étapes 1 à 5, dans l'ordre. */
const PENDING_ROWS = ['cash', 'stock', 'receivables', 'other', 'debts'] as const;

/**
 * Ligne sous la zakat estimée : ce qui manque d'abord (choix, prix du gramme, étapes à venir),
 * sinon le taux appliqué et ses précisions (part versée à l'encaissement, part de la boutique).
 */
export function useAsideNote(calc: ZakatCalculation, step: number, format: ZakatFormat): string[] {
  const t = useTranslations('zakat.aside');
  const { totals } = calc;

  if (totals.status === 'choice_missing') {
    return [t('note_missing', { items: format.list(totals.missing_choices.map((name) => t(`missing_name.${name}`))) })];
  }
  if (totals.status === 'nisab_unknown') return [t('note_nisab')];

  const pending = PENDING_ROWS.filter((_, i) => i + 1 >= calc.current_step && i + 1 !== step);
  if (pending.length > 0) {
    const items = format.list(pending.map((key) => t(`pending_name.${key}`)));
    return [t('note_pending', { items: items.charAt(0).toLocaleUpperCase() + items.slice(1) })];
  }

  const lines = [t('note_rate', { calendar: calc.choices.calendar ?? 'hijri' })];
  if (totals.zakat_on_collection !== null && !isZeroDecimal(totals.zakat_on_collection)) {
    lines.push(t('note_on_collection', { amount: format.money(totals.zakat_on_collection) }));
  }
  if (compareDecimal(totals.ownership_share, '100') !== 0) {
    lines.push(t('note_share', { share: format.percent(totals.ownership_share) }));
  }
  return lines;
}
