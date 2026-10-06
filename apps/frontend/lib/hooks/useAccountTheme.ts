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
  const {
    primaryId, bgId, primaryCustomHex, bgCustomHex,
    setPrimaryId, setBgId, setPrimaryCustomHex, setBgCustomHex,
  } = useColorTheme();
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

  const setAccountPrimaryCustomHex = useCallback(async (hex: string): Promise<void> => {
    const previousId = primaryId;
    const previousHex = primaryCustomHex;
    setPrimaryId('custom');
    setPrimaryCustomHex(hex);
    try {
      await updatePreferences.mutateAsync({ primary_color: 'custom', primary_color_custom_hex: hex });
    } catch (err) {
      setPrimaryId(previousId);
      setPrimaryCustomHex(previousHex);
      throw err;
    }
  }, [primaryId, primaryCustomHex, setPrimaryId, setPrimaryCustomHex, updatePreferences]);

  const setAccountBgCustomHex = useCallback(async (hex: string): Promise<void> => {
    const previousId = bgId;
    const previousHex = bgCustomHex;
    setBgId('custom');
    setBgCustomHex(hex);
    try {
      await updatePreferences.mutateAsync({ background_theme: 'custom', background_custom_hex: hex });
    } catch (err) {
      setBgId(previousId);
      setBgCustomHex(previousHex);
      throw err;
    }
  }, [bgId, bgCustomHex, setBgId, setBgCustomHex, updatePreferences]);

  return {
    setThemeMode,
    setPrimaryId: setAccountPrimaryId,
    setBgId: setAccountBgId,
    setAccountPrimaryCustomHex,
    setAccountBgCustomHex,
  };
}
