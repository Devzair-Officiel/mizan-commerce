import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="dashboard">{children}</AccessGuard>;
}
