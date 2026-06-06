import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function InvoicesLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="invoices">{children}</AccessGuard>;
}
