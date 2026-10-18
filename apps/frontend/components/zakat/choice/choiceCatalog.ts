import type { ChoiceName, ChoiceOption } from '@/lib/hooks/useZakat';

/** Clés de `zakat.chip.*` : qui retient chaque option (référentiel, § 4). */
export type ChipKey =
  | 'four_schools' | 'aaoifi' | 'hanafi' | 'maliki' | 'shafii' | 'hanbali'
  | 'contemporary' | 'shafii_new' | 'ibn_baz' | 'usual_conversion' | 'rate_hijri' | 'rate_solar';

export const CHOICE_CHIPS: { [C in ChoiceName]: Record<ChoiceOption<C>, readonly ChipKey[]> } = {
  calendar: { hijri: ['rate_hijri'], gregorian: ['rate_solar', 'aaoifi'] },
  nisab_method: { silver: ['usual_conversion'], gold: ['usual_conversion'] },
  stock_valuation: { sale: ['four_schools'], purchase: ['aaoifi'] },
  receivables_mode: { yearly: ['shafii', 'maliki'], on_collection: ['hanafi', 'hanbali'] },
  debts_mode: { all: ['hanafi', 'maliki', 'hanbali'], within_12_months: ['aaoifi', 'contemporary'], none: ['shafii_new', 'ibn_baz'] },
};

/** Étape de l'assistant (index 0..6) où chaque choix se fait. */
export const CHOICE_STEP: Record<ChoiceName, number> = {
  calendar: 0,
  nisab_method: 0,
  stock_valuation: 2,
  receivables_mode: 3,
  debts_mode: 5,
};

/** Ordre d'affichage des choix (récapitulatifs, réglages). */
export const CHOICE_ORDER: readonly ChoiceName[] = ['nisab_method', 'calendar', 'stock_valuation', 'receivables_mode', 'debts_mode'];
