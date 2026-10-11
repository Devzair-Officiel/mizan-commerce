'use client';

import { useProduct } from '@/lib/hooks/useProducts';

/** Nom de l'article filtré (lien « Voir tout » d'une fiche), « … » pendant le chargement. */
export function useMovementProductName(productId: string): string {
  const { data } = useProduct(productId);
  return data?.name ?? '…';
}
