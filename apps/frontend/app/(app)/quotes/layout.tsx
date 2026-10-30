import type { ReactNode } from 'react';
import { AccessGuard } from '@/components/auth/AccessGuard';

/** Devis : même module que les factures (même droit d'accès, même formule). */
export default function QuotesLayout({ children }: { children: ReactNode }) {
  return <AccessGuard module="invoices">{children}</AccessGuard>;
}
