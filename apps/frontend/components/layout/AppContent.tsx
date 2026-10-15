'use client';

import { useMe } from '@/lib/hooks/useMe';
import { useBurger } from './BurgerMenu';
import type { ReactNode } from 'react';

export function AppContent({ children }: { children: ReactNode }) {
  const { open } = useBurger();
  // Décalage desktop calé sur la largeur de la sidebar : déployée (272 px) ou en rail (80 px).
  const { data: me } = useMe();
  const offset = me?.sidebar_collapsed ? 'lg:ps-20' : 'lg:ps-68';
  return (
    <div
      className={`flex min-h-dvh flex-col transition-[transform,filter,padding] duration-300 ease-in-out ${offset}`}
      style={open ? { transform: 'scale(1.008)', filter: 'blur(1.5px) brightness(0.97)', transformOrigin: 'center center' } : undefined}
    >
      {children}
    </div>
  );
}
