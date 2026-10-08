'use client';

import type { ReactNode } from 'react';

export function FloatingActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="lg:hidden fixed inset-x-3 z-30 rounded-2xl border border-border bg-card shadow-lg flex items-center gap-3 p-2 ps-4"
      style={{ bottom: 'calc(var(--bottom-nav-h) + var(--sell-overflow) + 0.5rem)' }}
    >
      {children}
    </div>
  );
}
