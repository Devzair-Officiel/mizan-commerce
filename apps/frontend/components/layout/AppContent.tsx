'use client';

import { useBurger } from './BurgerMenu';
import type { ReactNode } from 'react';

export function AppContent({ children }: { children: ReactNode }) {
  const { open } = useBurger();
  return (
    <div
      className="flex min-h-dvh flex-col transition-[transform,filter] duration-300 ease-in-out"
      style={open ? { transform: 'scale(1.008)', filter: 'blur(1.5px) brightness(0.97)', transformOrigin: 'center center' } : undefined}
    >
      {children}
    </div>
  );
}
