import { BottomNav } from '@/components/layout/BottomNav';
import { BurgerMenuProvider, BurgerMenuDrawer } from '@/components/layout/BurgerMenu';
import { ThemeDrawerProvider, ThemeDrawerPanel } from '@/components/layout/ThemeDrawer';
import { SearchProvider } from '@/components/layout/SearchOverlay';
import { AppContent } from '@/components/layout/AppContent';
import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { LegacyTokenCleaner } from '@/components/layout/LegacyTokenCleaner';
import { OnboardingGate } from '@/components/layout/OnboardingGate';
import { AccountThemeSync } from '@/components/providers/AccountThemeSync';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeDrawerProvider>
      <BurgerMenuProvider>
        <SearchProvider>
          <DesktopSidebar />
          <AppContent>
            <AccountThemeSync />
            <LegacyTokenCleaner />
            <OnboardingGate />
            <div className="flex flex-col flex-1 lg:ms-60">
              <main className="flex-1 pb-20 lg:pb-8">
                <div className="lg:max-w-400 lg:mx-auto lg:px-6 lg:pt-8">
                  {children}
                </div>
              </main>
            </div>
            <BottomNav />
          </AppContent>
          <BurgerMenuDrawer />
        </SearchProvider>
      </BurgerMenuProvider>
      <ThemeDrawerPanel />
    </ThemeDrawerProvider>
  );
}
