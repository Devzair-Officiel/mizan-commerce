'use client';

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { useShop } from '@/lib/hooks/useShop';

/** Une boutique de services n'a pas de stock : ses pages Stock renvoient à l'accueil. */
export function StockCatalogGuard({ children }: { children: ReactNode }) {
  const { data: shop } = useShop();
  if (!shop) return null;
  if (shop.catalog_kind === 'services') redirect('/dashboard');
  return <>{children}</>;
}
