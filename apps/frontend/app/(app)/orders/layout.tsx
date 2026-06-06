import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="orders">{children}</AccessGuard>;
}
