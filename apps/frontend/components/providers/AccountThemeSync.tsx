'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/components/providers/ColorThemeProvider';
import { useMe, useUpdateAppearancePreferences } from '@/lib/hooks/useMe';
import {
  DEFAULT_BG_ID,
  DEFAULT_PRIMARY_ID,
  isBackgroundId,
  isPrimaryColorId,
  isThemeMode,
} from '@/lib/themes';

const NEXT_THEMES_STORAGE_KEY = 'theme';

/**
 * Le serveur est la source de vérité après connexion. Pour un ancien compte
 * dont les champs sont encore null, on importe une seule fois les préférences
 * déjà conservées par le navigateur, puis elles seront restaurables partout.
 */
export function AccountThemeSync() {
  const { data: me, isFetching } = useMe();
  const { setTheme } = useTheme();
  const { setPrimaryId, setBgId } = useColorTheme();
  const updatePreferences = useUpdateAppearancePreferences();
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!me || isFetching || syncedUserId.current === me.id) return;

    const storedMode = localStorage.getItem(NEXT_THEMES_STORAGE_KEY);
    const storedPrimary = localStorage.getItem('mizan-primary-color');
    const storedBackground = localStorage.getItem('mizan-bg-color');

    const themeMode = me.theme_mode
      ?? (isThemeMode(storedMode) ? storedMode : 'system');
    const primaryColor = me.primary_color
      ?? (isPrimaryColorId(storedPrimary) ? storedPrimary : DEFAULT_PRIMARY_ID);
    const backgroundTheme = me.background_theme
      ?? (isBackgroundId(storedBackground) ? storedBackground : DEFAULT_BG_ID);

    // Marquer avant les setters évite une seconde synchronisation si ceux-ci
    // provoquent un rendu pendant la mise à jour optimiste du cache `me`.
    syncedUserId.current = me.id;
    setTheme(themeMode);
    setPrimaryId(primaryColor);
    setBgId(backgroundTheme);

    if (
      me.theme_mode === null
      || me.primary_color === null
      || me.background_theme === null
    ) {
      updatePreferences.mutate({
        theme_mode: themeMode,
        primary_color: primaryColor,
        background_theme: backgroundTheme,
      });
    }
  }, [
    isFetching,
    me,
    setBgId,
    setPrimaryId,
    setTheme,
    updatePreferences,
  ]);

  return null;
}
