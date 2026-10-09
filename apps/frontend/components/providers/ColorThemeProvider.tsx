'use client';

import { createContext, useContext, useEffect, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import {
  PRIMARY_COLORS,
  BACKGROUNDS,
  PRIMARY_STORAGE_KEY,
  BG_STORAGE_KEY,
  PRIMARY_CUSTOM_HEX_KEY,
  BG_CUSTOM_HEX_KEY,
  DEFAULT_PRIMARY_ID,
  DEFAULT_BG_ID,
  DEFAULT_PRIMARY_CUSTOM_HEX,
  DEFAULT_BG_CUSTOM_HEX,
  applyThemeVars,
  type PrimaryColorDef,
  type BackgroundDef,
} from '@/lib/themes';

interface ColorThemeContextType {
  primaryId: string;
  bgId: string;
  primaryCustomHex: string;
  bgCustomHex: string;
  setPrimaryId: (id: string) => void;
  setBgId: (id: string) => void;
  setPrimaryCustomHex: (hex: string) => void;
  setBgCustomHex: (hex: string) => void;
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
  const primaryCustomHex = useSyncExternalStore(
    subscribeThemeStore,
    () => readStorage(PRIMARY_CUSTOM_HEX_KEY, DEFAULT_PRIMARY_CUSTOM_HEX),
    () => DEFAULT_PRIMARY_CUSTOM_HEX,
  );
  const bgCustomHex = useSyncExternalStore(
    subscribeThemeStore,
    () => readStorage(BG_CUSTOM_HEX_KEY, DEFAULT_BG_CUSTOM_HEX),
    () => DEFAULT_BG_CUSTOM_HEX,
  );

  useEffect(() => {
    applyThemeVars(primaryId, bgId, resolvedTheme === 'dark', primaryCustomHex, bgCustomHex);
  }, [primaryId, bgId, resolvedTheme, primaryCustomHex, bgCustomHex]);

  const setPrimaryId = useCallback((id: string) => {
    localStorage.setItem(PRIMARY_STORAGE_KEY, id);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const setBgId = useCallback((id: string) => {
    localStorage.setItem(BG_STORAGE_KEY, id);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const setPrimaryCustomHex = useCallback((hex: string) => {
    localStorage.setItem(PRIMARY_CUSTOM_HEX_KEY, hex);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const setBgCustomHex = useCallback((hex: string) => {
    localStorage.setItem(BG_CUSTOM_HEX_KEY, hex);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return (
    <ColorThemeContext.Provider value={{
      primaryId, bgId, primaryCustomHex, bgCustomHex,
      setPrimaryId, setBgId, setPrimaryCustomHex, setBgCustomHex,
      primaryColors: PRIMARY_COLORS, backgrounds: BACKGROUNDS,
    }}>
      {children}
    </ColorThemeContext.Provider>
  );
}
