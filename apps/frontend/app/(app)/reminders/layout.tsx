import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

export default function RemindersLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="reminders">{children}</AccessGuard>;
}
