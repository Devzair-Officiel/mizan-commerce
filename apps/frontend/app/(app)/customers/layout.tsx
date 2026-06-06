import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function CustomersLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="customers">{children}</AccessGuard>;
}
