import { BottomNav } from '@/components/layout/BottomNav';
import { BurgerMenuProvider, BurgerMenuDrawer } from '@/components/layout/BurgerMenu';
import { ThemeDrawerProvider, ThemeDrawerPanel } from '@/components/layout/ThemeDrawer';
import { SearchProvider } from '@/components/layout/SearchOverlay';
import { AppContent } from '@/components/layout/AppContent';
import { LegacyTokenCleaner } from '@/components/layout/LegacyTokenCleaner';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeDrawerProvider>
      <BurgerMenuProvider>
        <SearchProvider>
          <AppContent>
            <LegacyTokenCleaner />
            <main className="flex-1 pb-20">{children}</main>
            <BottomNav />
          </AppContent>
          <BurgerMenuDrawer />
        </SearchProvider>
      </BurgerMenuProvider>
      <ThemeDrawerPanel />
    </ThemeDrawerProvider>
  );
}
