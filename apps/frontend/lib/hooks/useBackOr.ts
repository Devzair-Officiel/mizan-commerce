'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/** Retour à la page précédente, ou à `fallbackHref` si on est arrivé directement ici. */
export function useBackOr(fallbackHref: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }, [router, fallbackHref]);
}
