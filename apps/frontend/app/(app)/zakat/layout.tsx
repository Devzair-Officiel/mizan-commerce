import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function ZakatLayout({ children }: { children: ReactNode }) {
  return <AccessGuard adminOnly>{children}</AccessGuard>;
}
