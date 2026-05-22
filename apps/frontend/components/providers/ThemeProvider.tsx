'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { ColorThemeProvider } from './ColorThemeProvider';
import type { ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ColorThemeProvider>
        {children}
      </ColorThemeProvider>
    </NextThemesProvider>
  );
}
