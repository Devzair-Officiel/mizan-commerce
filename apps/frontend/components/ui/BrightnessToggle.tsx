'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useAccountTheme } from '@/lib/hooks/useAccountTheme';
import { useIsClient } from '@/lib/hooks/useIsClient';
import type { ThemeMode } from '@/lib/themes';

type BrightnessOption = {
  value: ThemeMode;
  labelKey: 'brightness_light' | 'brightness_dark' | 'brightness_system';
  icon: LucideIcon;
};

export const BRIGHTNESS_OPTIONS: readonly BrightnessOption[] = [
  { value: 'light',  labelKey: 'brightness_light',  icon: Sun },
  { value: 'dark',   labelKey: 'brightness_dark',   icon: Moon },
  { value: 'system', labelKey: 'brightness_system', icon: Monitor },
];

/** Clair / sombre / système, enregistré sur le compte : panneau Apparence et pied de la sidebar (`compact` : 36 px de haut). */
export function BrightnessToggle({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('layout.themeDrawer');
  const tSidebar = useTranslations('layout.sidebar');
  const { theme } = useTheme();
  const { setThemeMode } = useAccountTheme();
  const mounted = useIsClient();

  if (!mounted) return <div className={`${compact ? 'h-9' : 'h-10.5'} rounded-xl bg-muted animate-pulse`} />;

  return (
    <div role="group" aria-label={tSidebar('theme')} className="flex rounded-xl border border-border overflow-hidden text-sm font-medium">
      {BRIGHTNESS_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setThemeMode(value)}
          aria-pressed={theme === value}
          className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${compact ? 'h-9 text-[13px]' : 'py-2.5'} ${
            theme === value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'
          } ${value !== 'light' ? 'border-s border-border' : ''}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
