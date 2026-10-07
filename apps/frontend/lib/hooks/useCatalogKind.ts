'use client';

import { useShop } from '@/lib/hooks/useShop';
import type { CatalogKind } from '@/lib/hooks/useMe';

export function useCatalogKind(): CatalogKind {
  const { data: shop } = useShop();
  return shop?.catalog_kind ?? 'both';
}
