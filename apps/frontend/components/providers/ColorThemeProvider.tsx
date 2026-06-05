'use client';

import { createContext, useContext, useEffect, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import {
  PRIMARY_COLORS,
  BACKGROUNDS,
  PRIMARY_STORAGE_KEY,
  BG_STORAGE_KEY,
  DEFAULT_PRIMARY_ID,
  DEFAULT_BG_ID,
  applyThemeVars,
  type PrimaryColorDef,
  type BackgroundDef,
} from '@/lib/themes';

interface ColorThemeContextType {
  primaryId: string;
  bgId: string;
  setPrimaryId: (id: string) => void;
  setBgId: (id: string) => void;
  primaryColors: PrimaryColorDef[];
  backgrounds: BackgroundDef[];
}

const ColorThemeContext = createContext<ColorThemeContextType | null>(null);

export function useColorTheme() {
  const ctx = useContext(ColorThemeContext);
  if (!ctx) throw new Error('useColorTheme must be used inside ColorThemeProvider');
  return ctx;
}

const THEME_CHANGE_EVENT = 'mizan-theme-change';

function subscribeThemeStore(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(THEME_CHANGE_EVENT, cb);
  };
}

function readStorage(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback;
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();

  const primaryId = useSyncExternalStore(
    subscribeThemeStore,
    () => readStorage(PRIMARY_STORAGE_KEY, DEFAULT_PRIMARY_ID),
    () => DEFAULT_PRIMARY_ID,
  );
  const bgId = useSyncExternalStore(
    subscribeThemeStore,
    () => readStorage(BG_STORAGE_KEY, DEFAULT_BG_ID),
    () => DEFAULT_BG_ID,
  );

  useEffect(() => {
    applyThemeVars(primaryId, bgId, resolvedTheme === 'dark');
  }, [primaryId, bgId, resolvedTheme]);

  const setPrimaryId = useCallback((id: string) => {
    localStorage.setItem(PRIMARY_STORAGE_KEY, id);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const setBgId = useCallback((id: string) => {
    localStorage.setItem(BG_STORAGE_KEY, id);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return (
    <ColorThemeContext.Provider value={{ primaryId, bgId, setPrimaryId, setBgId, primaryColors: PRIMARY_COLORS, backgrounds: BACKGROUNDS }}>
      {children}
    </ColorThemeContext.Provider>
  );
}
