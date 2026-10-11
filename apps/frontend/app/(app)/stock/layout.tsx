import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';
import { StockCatalogGuard } from '@/components/stock/StockCatalogGuard';

export default function StockLayout({ children }: { children: ReactNode }) {
  return (
    <AccessGuard module="stock">
      <StockCatalogGuard>{children}</StockCatalogGuard>
    </AccessGuard>
  );
}
