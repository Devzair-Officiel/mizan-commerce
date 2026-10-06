'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/components/providers/ColorThemeProvider';
import { useAccountTheme } from '@/lib/hooks/useAccountTheme';
import { useIsClient } from '@/lib/hooks/useIsClient';
import { ColorPickerSheet } from '@/components/ui/color-picker';

export function ThemeToggleButton() {
  const tc = useTranslations('layout.themeDrawer');
  const { resolvedTheme } = useTheme();
  const { setThemeMode } = useAccountTheme();
  const mounted = useIsClient();

  if (!mounted) return <div className="h-8 w-8" />;

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      aria-label={isDark ? tc('switch_to_light') : tc('switch_to_dark')}
    >
      {isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}

type BrightnessOption = {
  value: 'light' | 'dark' | 'system';
  labelKey: 'brightness_light' | 'brightness_dark' | 'brightness_system';
  icon: (props: { className?: string }) => React.JSX.Element;
};

const BRIGHTNESS_OPTIONS: readonly BrightnessOption[] = [
  { value: 'light',  labelKey: 'brightness_light',  icon: SunIcon },
  { value: 'dark',   labelKey: 'brightness_dark',   icon: MoonIcon },
  { value: 'system', labelKey: 'brightness_system', icon: SystemIcon },
];

export function ThemeToggle() {
  const t = useTranslations('layout.themeDrawer');
  const { theme } = useTheme();
  const { primaryId, bgId, primaryCustomHex, bgCustomHex, primaryColors, backgrounds } = useColorTheme();
  const { setThemeMode, setPrimaryId, setBgId, setAccountPrimaryCustomHex, setAccountBgCustomHex } = useAccountTheme();
  const mounted = useIsClient();

  const [primaryPickerOpen, setPrimaryPickerOpen] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

  if (!mounted) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mode clair / sombre */}
      <div className="flex rounded-xl border border-border overflow-hidden text-sm font-medium">
        {BRIGHTNESS_OPTIONS.map(({ value, labelKey, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setThemeMode(value)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 transition-colors ${
              theme === value
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            } ${value !== 'light' ? 'border-l border-border' : ''}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Couleur principale */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-0.5">{t('primary_color')}</p>
        <p className="text-xs text-muted-foreground mb-3">{t('primary_color_desc')}</p>
        <div className="grid grid-cols-5 gap-3">
          {primaryColors.map((pc) => {
            const active = primaryId === pc.id;
            return (
              <button
                key={pc.id}
                onClick={() => setPrimaryId(pc.id)}
                title={pc.label}
                className={`h-10 w-10 rounded-full border-2 transition-all flex items-center justify-center ${
                  active ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: pc.swatch }}
                aria-label={pc.label}
                aria-pressed={active}
              >
                {pc.id === 'default' && <ResetIcon className="h-4 w-4 text-white drop-shadow" />}
              </button>
            );
          })}
          {/* Swatch personnalisé */}
          <button
            onClick={() => setPrimaryPickerOpen(true)}
            title="Personnalisée"
            className={`h-10 w-10 rounded-full border-2 transition-all flex items-center justify-center overflow-hidden ${
              primaryId === 'custom'
                ? 'border-foreground scale-110 shadow-md'
                : 'border-transparent hover:scale-105'
            }`}
            style={{
              background: primaryId === 'custom'
                ? primaryCustomHex
                : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
            }}
            aria-label="Personnalisée"
            aria-pressed={primaryId === 'custom'}
          >
            {primaryId !== 'custom' && <PaletteIcon className="h-4 w-4 text-white drop-shadow" />}
          </button>
        </div>
      </div>

      {/* Arrière-plan */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-0.5">{t('background')}</p>
        <p className="text-xs text-muted-foreground mb-3">{t('background_desc')}</p>
        <div className="grid grid-cols-4 gap-3">
          {backgrounds.map((bg) => {
            const active = bgId === bg.id;
            return (
              <button
                key={bg.id}
                onClick={() => setBgId(bg.id)}
                title={bg.label}
                className={`h-10 w-10 rounded-full border-2 transition-all flex items-center justify-center ${
                  active ? 'border-foreground scale-110 shadow-md' : 'border-zinc-200 hover:scale-105'
                }`}
                style={{ backgroundColor: bg.swatch }}
                aria-label={bg.label}
                aria-pressed={active}
              >
                {bg.id === 'default' && <ResetIcon className="h-4 w-4 text-zinc-400 drop-shadow" />}
              </button>
            );
          })}
          {/* Swatch personnalisé */}
          <button
            onClick={() => setBgPickerOpen(true)}
            title="Personnalisée"
            className={`h-10 w-10 rounded-full border-2 transition-all flex items-center justify-center overflow-hidden ${
              bgId === 'custom'
                ? 'border-foreground scale-110 shadow-md'
                : 'border-zinc-200 hover:scale-105'
            }`}
            style={{
              background: bgId === 'custom'
                ? bgCustomHex
                : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
            }}
            aria-label="Personnalisée"
            aria-pressed={bgId === 'custom'}
          >
            {bgId !== 'custom' && <PaletteIcon className="h-4 w-4 text-white drop-shadow" />}
          </button>
        </div>
      </div>

      <ColorPickerSheet
        open={primaryPickerOpen}
        onClose={() => setPrimaryPickerOpen(false)}
        value={primaryCustomHex}
        onConfirm={setAccountPrimaryCustomHex}
        title="Couleur principale"
      />
      <ColorPickerSheet
        open={bgPickerOpen}
        onClose={() => setBgPickerOpen(false)}
        value={bgCustomHex}
        onConfirm={setAccountBgCustomHex}
        title="Couleur d'arrière-plan"
      />
    </div>
  );
}

function ResetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function SystemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
    </svg>
  );
}
