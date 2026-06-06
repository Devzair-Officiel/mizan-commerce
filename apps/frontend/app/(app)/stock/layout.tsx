import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function StockLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="stock">{children}</AccessGuard>;
}
