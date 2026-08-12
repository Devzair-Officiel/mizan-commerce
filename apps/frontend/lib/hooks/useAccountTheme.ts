'use client';

import { useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/components/providers/ColorThemeProvider';
import { useUpdateAppearancePreferences } from '@/lib/hooks/useMe';
import { isThemeMode, type ThemeMode } from '@/lib/themes';

/**
 * Applique les changements immédiatement dans le navigateur puis les rattache
 * au compte. En cas d'échec réseau/API, l'affichage revient à la valeur
 * précédente pour ne pas laisser croire que la préférence a été enregistrée.
 */
export function useAccountTheme() {
  const { theme, setTheme } = useTheme();
  const { primaryId, bgId, setPrimaryId, setBgId } = useColorTheme();
  const updatePreferences = useUpdateAppearancePreferences();

  const setThemeMode = useCallback((mode: ThemeMode) => {
    const previous = isThemeMode(theme) ? theme : 'system';
    setTheme(mode);
    updatePreferences.mutate(
      { theme_mode: mode },
      { onError: () => setTheme(previous) },
    );
  }, [setTheme, theme, updatePreferences]);

  const setAccountPrimaryId = useCallback((id: string) => {
    const previous = primaryId;
    setPrimaryId(id);
    updatePreferences.mutate(
      { primary_color: id },
      { onError: () => setPrimaryId(previous) },
    );
  }, [primaryId, setPrimaryId, updatePreferences]);

  const setAccountBgId = useCallback((id: string) => {
    const previous = bgId;
    setBgId(id);
    updatePreferences.mutate(
      { background_theme: id },
      { onError: () => setBgId(previous) },
    );
  }, [bgId, setBgId, updatePreferences]);

  return {
    setThemeMode,
    setPrimaryId: setAccountPrimaryId,
    setBgId: setAccountBgId,
  };
}
