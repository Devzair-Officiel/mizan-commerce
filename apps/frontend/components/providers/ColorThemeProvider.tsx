'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [primaryId, setPrimaryIdState] = useState<string>(DEFAULT_PRIMARY_ID);
  const [bgId, setBgIdState] = useState<string>(DEFAULT_BG_ID);

  useEffect(() => {
    const pid = localStorage.getItem(PRIMARY_STORAGE_KEY) ?? DEFAULT_PRIMARY_ID;
    const bid = localStorage.getItem(BG_STORAGE_KEY) ?? DEFAULT_BG_ID;
    setPrimaryIdState(pid);
    setBgIdState(bid);
    applyThemeVars(pid, bid, resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setPrimaryId = useCallback((id: string) => {
    localStorage.setItem(PRIMARY_STORAGE_KEY, id);
    setPrimaryIdState(id);
    applyThemeVars(id, localStorage.getItem(BG_STORAGE_KEY) ?? DEFAULT_BG_ID, resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setBgId = useCallback((id: string) => {
    localStorage.setItem(BG_STORAGE_KEY, id);
    setBgIdState(id);
    applyThemeVars(localStorage.getItem(PRIMARY_STORAGE_KEY) ?? DEFAULT_PRIMARY_ID, id, resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return (
    <ColorThemeContext.Provider value={{ primaryId, bgId, setPrimaryId, setBgId, primaryColors: PRIMARY_COLORS, backgrounds: BACKGROUNDS }}>
      {children}
    </ColorThemeContext.Provider>
  );
}
