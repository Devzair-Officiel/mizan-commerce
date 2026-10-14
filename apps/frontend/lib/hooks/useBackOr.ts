'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Page chargée directement ici (lien, favori, rechargement) : l'entrée précédente de l'historique
 * appartient à un autre document, et y revenir recharge tout (notification perdue) ou quitte l'app.
 */
function landedHere(): boolean {
  const [entry] = performance.getEntriesByType('navigation');
  return !entry || new URL(entry.name).pathname === window.location.pathname;
}

/** Retour à la page précédente, ou à `fallbackHref` (à sa place) si on est arrivé directement ici. */
export function useBackOr(fallbackHref: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1 && !landedHere()) router.back();
    else router.replace(fallbackHref);
  }, [router, fallbackHref]);
}
