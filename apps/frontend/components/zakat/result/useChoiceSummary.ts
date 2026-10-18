'use client';

import { useTranslations } from 'next-intl';
import { compareDecimal } from '@/lib/decimal';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { CHOICE_ORDER, CHOICE_STEP } from '../choice/choiceCatalog';
import type { ZakatFormat } from '../useZakatFormat';

const SHORT_VALUES = new Set(['stock_valuation', 'receivables_mode', 'debts_mode']);
/** La part se règle à l'étape Jour J. */
const SHARE_STEP = 0;

export interface ChoiceSummaryRow {
  key: string;
  label: string;
  value: string;
  /** Valeur abrégée, pour la ligne de récapitulatif mobile. */
  short: string;
  step: number;
}

/** « Vos choix » de la fiche, dans l'ordre des récapitulatifs ; la part n'apparaît que si elle n'est pas de 100 %. */
export function useChoiceSummary(calc: ZakatCalculation, format: ZakatFormat): ChoiceSummaryRow[] {
  const t = useTranslations('zakat.summary');
  const { choices } = calc;
  const rows: ChoiceSummaryRow[] = CHOICE_ORDER.map((name) => {
    const value = choices[name];
    const label = t(`label.${name}`);
    if (!value) return { key: name, label, value: t('missing'), short: t('missing'), step: CHOICE_STEP[name] };
    const valueKey: string = `value.${name}`;
    const shortKey: string = SHORT_VALUES.has(name) ? `value_short.${name}` : valueKey;
    const price = name === 'nisab_method' ? choices.nisab_unit_price : null;
    return {
      key: name, label, step: CHOICE_STEP[name], short: t(shortKey, { value }),
      value: price ? t('value.nisab_price', { value, price: format.money(price) }) : t(valueKey, { value }),
    };
  });
  const share = choices.ownership_share;
  if (share && compareDecimal(share, '100') !== 0) {
    const value = t('value.ownership_share', { value: format.percent(share) });
    rows.push({ key: 'ownership_share', label: t('label.ownership_share'), value, short: value, step: SHARE_STEP });
  }
  return rows;
}
