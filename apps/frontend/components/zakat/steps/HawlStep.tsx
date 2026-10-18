'use client';

import type { YearTaken } from '@/lib/hooks/useZakat';
import { CalcChoice } from '../choice/CalcChoice';
import { HawlDateCard } from './HawlDateCard';
import { NisabPriceCard } from './NisabPriceCard';
import { ShareCard } from './ShareCard';
import type { StepProps } from './types';

/** Étape 1 : jour J, seuil (métal et prix du gramme), année de calcul, part de la boutique. */
export function HawlStep({ yearTaken, ...props }: StepProps & { yearTaken: YearTaken | null }) {
  const { calc, save, format } = props;
  return (
    <>
      <HawlDateCard {...props} yearTaken={yearTaken} />
      <CalcChoice {...props} name="nisab_method" />
      <NisabPriceCard metal={calc.choices.nisab_method} price={calc.choices.nisab_unit_price}
        threshold={calc.totals.nisab_threshold} format={format}
        onSave={(amount) => save({ choices: { nisab_unit_price: amount } })} />
      <CalcChoice {...props} name="calendar" />
      <ShareCard share={calc.choices.ownership_share} format={format}
        onSave={(amount) => save({ choices: { ownership_share: amount } })} />
    </>
  );
}
