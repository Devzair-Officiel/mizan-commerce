import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="products">{children}</AccessGuard>;
}
