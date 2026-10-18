'use client';

import { useTranslations } from 'next-intl';
import {
  CHOICE_OPTIONS, type ChoiceName, type ChoiceOption, type ZakatCalculation, type ZakatCalculationChanges,
} from '@/lib/hooks/useZakat';
import type { ZakatFormat } from '../useZakatFormat';
import type { ZakatAutosave } from '../wizard/useZakatAutosave';
import type { OptionExtras } from './ChoiceGroup';
import { ChoiceSection } from './ChoiceSection';

interface CalcChoiceProps<C extends ChoiceName> {
  calc: ZakatCalculation;
  save: ZakatAutosave['save'];
  format: ZakatFormat;
  name: C;
  /** Montant propre à chaque option, calculé par le serveur et déjà mis en forme (valeur du stock, dettes déduites). */
  amounts?: Partial<Record<ChoiceOption<C>, string>>;
  /** Montant à droite de la carte plutôt que sous le texte. */
  amountPlacement?: 'amount' | 'trailing';
  columns?: 1 | 2;
  questionIsHeading?: boolean;
}

/** Choix d'avis d'une fiche : enregistré au geste, chaque option avec la zakat estimée qu'elle donnerait. */
export function CalcChoice<C extends ChoiceName>({ calc, save, format, name, amounts, amountPlacement = 'amount', columns, questionIsHeading }: CalcChoiceProps<C>) {
  const t = useTranslations('zakat.choice');
  const effects = calc.totals.option_effects[name] as Record<ChoiceOption<C>, string | null>;
  const extras: Partial<Record<ChoiceOption<C>, OptionExtras>> = {};
  for (const option of CHOICE_OPTIONS[name] as readonly ChoiceOption<C>[]) {
    const effect = effects[option] ?? null;
    extras[option] = {
      [amountPlacement]: amounts?.[option],
      effect: effect === null ? undefined : t('effect', { amount: format.money(effect) }),
    };
  }

  return (
    <ChoiceSection
      name={name}
      value={calc.choices[name] as ChoiceOption<C> | null}
      onChange={(value) => save({ choices: { [name]: value } as ZakatCalculationChanges['choices'] }, true)}
      extras={extras}
      columns={columns}
      isLatest={calc.review.is_latest}
      questionIsHeading={questionIsHeading}
    />
  );
}
