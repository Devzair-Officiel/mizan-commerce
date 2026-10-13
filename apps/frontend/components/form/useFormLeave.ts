'use client';

import { useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { confirmLeave, registerDirtyChecker, unregisterDirtyChecker } from '@/lib/dirtyGuard';

/**
 * Garde « quitter sans enregistrer » d'un formulaire. Tant que `dirty`, la TopBar, la barre du
 * bas et le menu demandent confirmation avant de quitter. Renvoie l'action « Annuler » :
 * même confirmation, puis `onLeave`.
 */
export function useFormLeave(dirty: boolean, onLeave: () => void): () => void {
  const tc = useTranslations('layout.common');

  useEffect(() => {
    registerDirtyChecker(() => dirty);
    return unregisterDirtyChecker;
  }, [dirty]);

  return useCallback(() => {
    if (confirmLeave(tc('confirm_leave'))) onLeave();
  }, [tc, onLeave]);
}
