'use client';

import type { ReactNode } from 'react';

interface FloatingActionBarProps {
  children: ReactNode;
  /** summary: rounded card (label + button). button: no card, button fills width. */
  variant?: 'summary' | 'button';
}

const BOTTOM = 'calc(var(--bottom-nav-h) + var(--sell-overflow) + 0.5rem)';

export function FloatingActionBar({ children, variant = 'summary' }: FloatingActionBarProps) {
  if (variant === 'button') {
    return (
      <div
        className="lg:hidden fixed inset-x-4 z-30"
        style={{ bottom: BOTTOM }}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className="lg:hidden fixed inset-x-3 z-30 rounded-2xl border border-border bg-card shadow-lg flex items-center gap-3 p-2 ps-4"
      style={{ bottom: BOTTOM }}
    >
      {children}
    </div>
  );
}
