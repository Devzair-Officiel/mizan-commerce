import type { ChoiceName, ZakatCalculation } from '@/lib/hooks/useZakat';
import { CHOICE_STEP } from '../choice/choiceCatalog';

/** Jour J, Trésorerie, Stock, Créances, Autres biens, Dettes, Résultat ; `?etape=` vaut l'index + 1. */
export const STEP_COUNT = 7;
export const RESULT_STEP = 6;

export function parseStep(param: string | null): number {
  const n = Number(param);
  return Number.isInteger(n) && n >= 1 && n <= STEP_COUNT ? n - 1 : 0;
}

export function stepHref(id: string, step: number): string {
  return `/zakat/${id}?etape=${step + 1}`;
}

/** Choix à faire sur une étape avant « Continuer ». */
export function stepChoices(step: number): ChoiceName[] {
  return (Object.keys(CHOICE_STEP) as ChoiceName[]).filter((name) => CHOICE_STEP[name] === step);
}

export function missingStepChoices(calc: ZakatCalculation, step: number): ChoiceName[] {
  return stepChoices(step).filter((name) => !calc.choices[name]);
}

/** Étape validée par « Continuer » (`current_step` = nombre d'étapes faites). */
export function isStepDone(calc: ZakatCalculation, step: number): boolean {
  return step < calc.current_step;
}

/** Où rouvrir une fiche : la première étape pas encore validée, ou le résultat. */
export function resumeHref(id: string, doneCount: number): string {
  return stepHref(id, Math.min(doneCount, RESULT_STEP));
}
