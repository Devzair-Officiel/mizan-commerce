import { BottomNav } from '@/components/layout/BottomNav';
import { LegacyTokenCleaner } from '@/components/layout/LegacyTokenCleaner';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50">
      <LegacyTokenCleaner />
      <main className="flex-1 pb-16">{children}</main>
      <BottomNav />
    </div>
  );
}
