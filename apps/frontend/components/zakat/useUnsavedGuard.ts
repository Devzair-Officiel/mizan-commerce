'use client';

import { useEffect } from 'react';
import { registerDirtyChecker, unregisterDirtyChecker } from '@/lib/dirtyGuard';

/**
 * Saisies pas encore enregistrées : confirmation avant de quitter par la navigation de l'app (§ 8),
 * alerte du navigateur avant de fermer ou recharger la page. `unsaved` doit rester stable (`useCallback`).
 */
export function useUnsavedGuard(unsaved: () => boolean): void {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => { if (unsaved()) event.preventDefault(); };
    registerDirtyChecker(unsaved);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      unregisterDirtyChecker();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [unsaved]);
}
