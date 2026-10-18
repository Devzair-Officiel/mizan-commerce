'use client';

import type { YearTaken } from '@/lib/hooks/useZakat';
import { CashStep } from '../steps/CashStep';
import { DebtsStep } from '../steps/DebtsStep';
import { HawlStep } from '../steps/HawlStep';
import { OtherStep } from '../steps/OtherStep';
import { ReceivablesStep } from '../steps/ReceivablesStep';
import { StockStep } from '../steps/StockStep';
import type { StepProps } from '../steps/types';

/** Contenu d'une étape de saisie (0 à 5) ; le résultat a son propre gabarit. */
export function StepContent({ step, yearTaken, ...props }: StepProps & { step: number; yearTaken: YearTaken | null }) {
  switch (step) {
    case 0: return <HawlStep {...props} yearTaken={yearTaken} />;
    case 1: return <CashStep {...props} />;
    case 2: return <StockStep {...props} />;
    case 3: return <ReceivablesStep {...props} />;
    case 4: return <OtherStep {...props} />;
    default: return <DebtsStep {...props} />;
  }
}
