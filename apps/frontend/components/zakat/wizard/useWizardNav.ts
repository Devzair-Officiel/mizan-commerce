'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ZakatCalculation } from '@/lib/hooks/useZakat';
import { stepHref } from './stepNav';
import type { ZakatAutosave } from './useZakatAutosave';

/**
 * Changement d'étape : la saisie en cours est d'abord enregistrée (Q1), puis l'adresse change.
 * « Continuer » valide aussi l'étape (`current_step` ne fait qu'avancer).
 */
export function useWizardNav(calc: ZakatCalculation, step: number, autosave: ZakatAutosave) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go(target: number, validate = false) {
    if (validate && target > calc.current_step) autosave.save({ current_step: target }, true);
    setBusy(true);
    const ok = await autosave.flush();
    setBusy(false);
    if (ok) router.push(stepHref(calc.id, target));
  }

  return {
    busy,
    go: (target: number) => void go(target),
    previous: () => void go(step - 1),
    next: () => void go(step + 1, true),
  };
}
