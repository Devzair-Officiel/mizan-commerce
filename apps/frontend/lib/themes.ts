import { converter } from 'culori';

export interface ThemeVars {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  border: string;
  input: string;
  ring: string;
}

export interface PrimaryColorDef {
  id: string;
  label: string;
  hue: number | null;
  chroma: number;
  swatch: string;
  overrides?: { light?: Partial<ThemeVars>; dark?: Partial<ThemeVars> };
}

export interface BackgroundDef {
  id: string;
  label: string;
  swatch: string;
  light: string;
  dark: string;
  lightGradient: string;
  darkGradient: string;
  overrides?: { light?: Partial<ThemeVars>; dark?: Partial<ThemeVars> };
}

export type ThemeMode = 'light' | 'dark' | 'system';

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export const PRIMARY_COLORS: PrimaryColorDef[] = [
  { id: 'default',  label: 'Défaut',    hue: null, chroma: 0,    swatch: '#94a3b8' },
  { id: 'blue',     label: 'Bleu',       hue: 250,  chroma: 0.26, swatch: '#3b82f6' },
  { id: 'purple',   label: 'Violet',     hue: 270,  chroma: 0.27, swatch: '#8b5cf6' },
  { id: 'indigo',   label: 'Indigo',     hue: 285,  chroma: 0.24, swatch: '#6d28d9' },
  { id: 'magenta',  label: 'Fuchsia',    hue: 320,  chroma: 0.24, swatch: '#d946ef' },
  { id: 'rose',     label: 'Rose',       hue: 345,  chroma: 0.22, swatch: '#f43f5e' },
  { id: 'red',      label: 'Rouge',      hue: 15,   chroma: 0.24, swatch: '#ef4444' },
  { id: 'orange',   label: 'Orange',     hue: 40,   chroma: 0.22, swatch: '#f97316' },
  { id: 'amber',    label: 'Ambre',      hue: 75,   chroma: 0.20, swatch: '#f59e0b' },
  { id: 'forest',   label: 'Forêt',      hue: 145,  chroma: 0.18, swatch: '#16a34a' },
  { id: 'mint',     label: 'Menthe',     hue: 168,  chroma: 0.19, swatch: '#10b981' },
  {
    id: 'sage', label: 'Sauge', hue: 170, chroma: 0.075, swatch: '#367762',
    overrides: {
      light: {
        primary:              'oklch(0.52 0.075 170)',
        'primary-foreground': 'oklch(1 0 0)',
        ring:                 'oklch(0.52 0.075 170)',
      },
      dark: {
        primary:              'oklch(0.76 0.07 170)',
        'primary-foreground': 'oklch(0.24 0.012 170)',
        ring:                 'oklch(0.76 0.07 170)',
        secondary:            'oklch(0.34 0.018 170)',
        accent:               'oklch(0.34 0.018 170)',
      },
    },
  },
  { id: 'cyan',     label: 'Cyan',       hue: 200,  chroma: 0.22, swatch: '#06b6d4' },
  { id: 'slate',    label: 'Ardoise',    hue: 220,  chroma: 0.06, swatch: '#64748b' },
  { id: 'taupe',    label: 'Taupe',      hue: 35,   chroma: 0.09, swatch: '#92400e' },
  { id: 'charcoal', label: 'Anthracite', hue: 240,  chroma: 0.02, swatch: '#374151' },
];

export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: 'default', label: 'Défaut', swatch: '#f8fafc',
    light: 'oklch(1 0 0)', dark: 'oklch(0.20 0 0)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0 0) 0%, oklch(0.97 0 0) 40%, oklch(0.92 0 0) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0 0) 0%, oklch(0.20 0 0) 50%, oklch(0.11 0 0) 100%)',
  },
  {
    id: 'cream', label: 'Crème', swatch: '#FAF6EF',
    light:         'oklch(0.975 0.010 85)',
    dark:          'oklch(0.24 0.012 170)',
    lightGradient: 'linear-gradient(to bottom, oklch(0.985 0.006 85) 0%, oklch(0.965 0.012 85) 100%)',
    darkGradient:  'linear-gradient(to bottom, oklch(0.26 0.012 170) 0%, oklch(0.22 0.012 170) 100%)',
    overrides: {
      light: {
        foreground:           'oklch(0.27 0.02 170)',
        card:                 'oklch(0.995 0.005 85)',
        'card-foreground':    'oklch(0.27 0.02 170)',
        popover:              'oklch(0.995 0.005 85)',
        'popover-foreground': 'oklch(0.27 0.02 170)',
        muted:                'oklch(0.945 0.012 90)',
        'muted-foreground':   'oklch(0.53 0.012 170)',
        border:               'oklch(0.90 0.014 90)',
        input:                'oklch(0.90 0.014 90)',
      },
      dark: {
        foreground:           'oklch(0.93 0.008 85)',
        card:                 'oklch(0.29 0.014 170)',
        'card-foreground':    'oklch(0.93 0.008 85)',
        popover:              'oklch(0.29 0.014 170)',
        'popover-foreground': 'oklch(0.93 0.008 85)',
        muted:                'oklch(0.33 0.014 170)',
        'muted-foreground':   'oklch(0.74 0.010 160)',
      },
    },
  },
  {
    id: 'warm', label: 'Chaud', swatch: '#fef3c7',
    light: 'oklch(0.99 0.008 80)', dark: 'oklch(0.20 0.012 80)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 80) 0%, oklch(0.965 0.035 78) 50%, oklch(0.90 0.09 75) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.018 80) 0%, oklch(0.20 0.042 78) 50%, oklch(0.11 0.085 75) 100%)',
  },
  {
    id: 'sky', label: 'Ciel', swatch: '#e0f2fe',
    light: 'oklch(0.985 0.008 230)', dark: 'oklch(0.20 0.014 230)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 230) 0%, oklch(0.965 0.035 228) 50%, oklch(0.90 0.09 225) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.022 230) 0%, oklch(0.20 0.048 228) 50%, oklch(0.11 0.090 225) 100%)',
  },
  {
    id: 'blush', label: 'Blush', swatch: '#fce7f3',
    light: 'oklch(0.985 0.008 10)', dark: 'oklch(0.20 0.014 10)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 10) 0%, oklch(0.965 0.035 8) 50%, oklch(0.90 0.085 5) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.022 10) 0%, oklch(0.20 0.048 8) 50%, oklch(0.11 0.090 5) 100%)',
  },
  {
    id: 'rosé', label: 'Rosé', swatch: '#fecdd3',
    light: 'oklch(0.975 0.012 350)', dark: 'oklch(0.20 0.018 350)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 350) 0%, oklch(0.965 0.040 348) 50%, oklch(0.90 0.10 345) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.026 350) 0%, oklch(0.20 0.055 348) 50%, oklch(0.11 0.105 345) 100%)',
  },
  {
    id: 'mint', label: 'Menthe', swatch: '#a7f3d0',
    light: 'oklch(0.975 0.012 168)', dark: 'oklch(0.20 0.018 168)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 168) 0%, oklch(0.965 0.040 167) 50%, oklch(0.90 0.10 165) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.026 168) 0%, oklch(0.20 0.055 167) 50%, oklch(0.11 0.105 165) 100%)',
  },
  {
    id: 'straw', label: 'Paille', swatch: '#fde68a',
    light: 'oklch(0.975 0.015 80)', dark: 'oklch(0.20 0.020 80)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 80) 0%, oklch(0.965 0.045 78) 50%, oklch(0.90 0.11 75) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.030 80) 0%, oklch(0.20 0.060 78) 50%, oklch(0.11 0.115 75) 100%)',
  },
  {
    id: 'lavender', label: 'Lavande', swatch: '#ddd6fe',
    light: 'oklch(0.975 0.012 290)', dark: 'oklch(0.20 0.018 290)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 290) 0%, oklch(0.965 0.040 288) 50%, oklch(0.90 0.10 285) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.026 290) 0%, oklch(0.20 0.055 288) 50%, oklch(0.11 0.105 285) 100%)',
  },
  {
    id: 'steel', label: 'Acier', swatch: '#cbd5e1',
    light: 'oklch(0.975 0.006 220)', dark: 'oklch(0.20 0.010 220)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.001 220) 0%, oklch(0.965 0.020 219) 50%, oklch(0.90 0.055 218) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.015 220) 0%, oklch(0.20 0.030 219) 50%, oklch(0.11 0.060 218) 100%)',
  },
  {
    id: 'sage', label: 'Sauge', swatch: '#bbf7d0',
    light: 'oklch(0.975 0.010 140)', dark: 'oklch(0.20 0.015 140)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 140) 0%, oklch(0.965 0.035 139) 50%, oklch(0.90 0.088 138) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.022 140) 0%, oklch(0.20 0.048 139) 50%, oklch(0.11 0.090 138) 100%)',
  },
  {
    id: 'peach', label: 'Pêche', swatch: '#fed7aa',
    light: 'oklch(0.975 0.015 40)', dark: 'oklch(0.20 0.020 40)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 40) 0%, oklch(0.965 0.045 39) 50%, oklch(0.90 0.11 38) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.030 40) 0%, oklch(0.20 0.060 39) 50%, oklch(0.11 0.115 38) 100%)',
  },
  {
    id: 'lilac', label: 'Lilas', swatch: '#f5d0fe',
    light: 'oklch(0.975 0.010 305)', dark: 'oklch(0.20 0.015 305)',
    lightGradient: 'linear-gradient(135deg, oklch(1 0.002 305) 0%, oklch(0.965 0.035 303) 50%, oklch(0.90 0.088 300) 100%)',
    darkGradient:  'linear-gradient(135deg, oklch(0.30 0.022 305) 0%, oklch(0.20 0.048 303) 50%, oklch(0.11 0.090 300) 100%)',
  },
];

export const PRIMARY_STORAGE_KEY = 'mizan-primary-color';
export const BG_STORAGE_KEY = 'mizan-bg-color';
export const PRIMARY_CUSTOM_HEX_KEY = 'mizan-primary-custom-hex';
export const BG_CUSTOM_HEX_KEY = 'mizan-bg-custom-hex';
export const DEFAULT_PRIMARY_ID = 'sage';
export const DEFAULT_BG_ID = 'cream';
export const DEFAULT_PRIMARY_CUSTOM_HEX = '#3b82f6';
export const DEFAULT_BG_CUSTOM_HEX = '#e0f2fe';

export function isPrimaryColorId(value: string | null | undefined): value is string {
  return value != null && (value === 'custom' || PRIMARY_COLORS.some((color) => color.id === value));
}

export function isBackgroundId(value: string | null | undefined): value is string {
  return value != null && (value === 'custom' || BACKGROUNDS.some((background) => background.id === value));
}

const toOklch = converter('oklch');

export function hexToHueChroma(hex: string): { hue: number; chroma: number } {
  const mode = toOklch(hex);
  return { hue: mode?.h ?? 0, chroma: mode?.c ?? 0.2 };
}

export function hexToBackgroundDef(
  hex: string,
): Pick<BackgroundDef, 'light' | 'dark' | 'lightGradient' | 'darkGradient'> {
  const { hue: h } = hexToHueChroma(hex);
  const h2 = h - 2;
  const h5 = h - 5;
  return {
    light: `oklch(0.985 0.008 ${h})`,
    dark: `oklch(0.20 0.012 ${h})`,
    lightGradient: `linear-gradient(135deg, oklch(1 0.002 ${h}) 0%, oklch(0.965 0.035 ${h2}) 50%, oklch(0.90 0.09 ${h5}) 100%)`,
    darkGradient: `linear-gradient(135deg, oklch(0.30 0.018 ${h}) 0%, oklch(0.20 0.042 ${h2}) 50%, oklch(0.11 0.085 ${h5}) 100%)`,
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

// Toujours présent (head des constantes ci-dessus) — extrait pour aider l'inférence TS
// sous `noUncheckedIndexedAccess`.
const DEFAULT_PRIMARY: PrimaryColorDef = PRIMARY_COLORS[0]!;
const DEFAULT_BG: BackgroundDef = BACKGROUNDS[0]!;

type BgSlice = Pick<BackgroundDef, 'light' | 'dark' | 'lightGradient' | 'darkGradient'>;

function resolveBg(bgId: string, bgCustomHex?: string): BgSlice {
  if (bgId === 'custom' && bgCustomHex) return hexToBackgroundDef(bgCustomHex);
  return BACKGROUNDS.find(b => b.id === bgId) ?? DEFAULT_BG;
}

function buildThemeVars(
  primaryId: string,
  bgId: string,
  isDark: boolean,
  primaryCustomHex?: string,
  bgCustomHex?: string,
): ThemeVars {
  let h: number | null;
  let c: number;
  let pcDef: PrimaryColorDef | undefined;

  if (primaryId === 'custom' && primaryCustomHex) {
    const derived = hexToHueChroma(primaryCustomHex);
    h = derived.hue;
    c = derived.chroma;
  } else {
    pcDef = PRIMARY_COLORS.find(color => color.id === primaryId) ?? DEFAULT_PRIMARY;
    h = pcDef.hue;
    c = pcDef.chroma;
  }

  const bg = resolveBg(bgId, bgCustomHex);
  const bgDef = bgId !== 'custom'
    ? (BACKGROUNDS.find(b => b.id === bgId) ?? DEFAULT_BG)
    : undefined;

  let base: ThemeVars;

  if (h === null) {
    base = isDark ? {
      background: bg.dark,
      foreground: 'oklch(0.985 0 0)',
      card: 'oklch(0.26 0 0)',
      'card-foreground': 'oklch(0.985 0 0)',
      popover: 'oklch(0.26 0 0)',
      'popover-foreground': 'oklch(0.985 0 0)',
      primary: 'oklch(0.922 0 0)',
      'primary-foreground': 'oklch(0.205 0 0)',
      secondary: 'oklch(0.32 0 0)',
      'secondary-foreground': 'oklch(0.985 0 0)',
      muted: 'oklch(0.32 0 0)',
      'muted-foreground': 'oklch(0.708 0 0)',
      accent: 'oklch(0.32 0 0)',
      'accent-foreground': 'oklch(0.985 0 0)',
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
      ring: 'oklch(0.556 0 0)',
    } : {
      background: bg.light,
      foreground: 'oklch(0.145 0 0)',
      card: 'oklch(1 0 0)',
      'card-foreground': 'oklch(0.145 0 0)',
      popover: 'oklch(1 0 0)',
      'popover-foreground': 'oklch(0.145 0 0)',
      primary: 'oklch(0.205 0 0)',
      'primary-foreground': 'oklch(0.985 0 0)',
      secondary: 'oklch(0.97 0 0)',
      'secondary-foreground': 'oklch(0.205 0 0)',
      muted: 'oklch(0.97 0 0)',
      'muted-foreground': 'oklch(0.556 0 0)',
      accent: 'oklch(0.97 0 0)',
      'accent-foreground': 'oklch(0.205 0 0)',
      border: 'oklch(0.922 0 0)',
      input: 'oklch(0.922 0 0)',
      ring: 'oklch(0.708 0 0)',
    };
  } else {
    const cc = (factor: number) => clamp(c * factor, 0.004, 0.32).toFixed(4);

    base = isDark ? {
      background: bg.dark,
      foreground: 'oklch(0.985 0 0)',
      card: `oklch(0.25 ${cc(0.16)} ${h})`,
      'card-foreground': 'oklch(0.985 0 0)',
      popover: `oklch(0.25 ${cc(0.16)} ${h})`,
      'popover-foreground': 'oklch(0.985 0 0)',
      primary: `oklch(0.70 ${cc(0.85)} ${h})`,
      'primary-foreground': `oklch(0.14 ${cc(0.30)} ${h})`,
      secondary: `oklch(0.31 ${cc(0.22)} ${h})`,
      'secondary-foreground': 'oklch(0.985 0 0)',
      muted: `oklch(0.30 ${cc(0.20)} ${h})`,
      'muted-foreground': 'oklch(0.708 0 0)',
      accent: `oklch(0.32 ${cc(0.26)} ${h})`,
      'accent-foreground': 'oklch(0.985 0 0)',
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
      ring: `oklch(0.70 ${cc(0.85)} ${h})`,
    } : {
      background: bg.light,
      foreground: 'oklch(0.145 0 0)',
      card: `oklch(0.998 ${cc(0.05)} ${h})`,
      'card-foreground': 'oklch(0.145 0 0)',
      popover: `oklch(0.998 ${cc(0.05)} ${h})`,
      'popover-foreground': 'oklch(0.145 0 0)',
      primary: `oklch(0.50 ${cc(1)} ${h})`,
      'primary-foreground': `oklch(0.97 ${cc(0.08)} ${h})`,
      secondary: `oklch(0.93 ${cc(0.30)} ${h})`,
      'secondary-foreground': `oklch(0.30 ${cc(0.60)} ${h})`,
      muted: `oklch(0.95 ${cc(0.18)} ${h})`,
      'muted-foreground': 'oklch(0.556 0 0)',
      accent: `oklch(0.93 ${cc(0.35)} ${h})`,
      'accent-foreground': `oklch(0.30 ${cc(0.70)} ${h})`,
      border: `oklch(0.88 ${cc(0.20)} ${h})`,
      input: `oklch(0.88 ${cc(0.20)} ${h})`,
      ring: `oklch(0.50 ${cc(1)} ${h})`,
    };
  }

  const mode = isDark ? 'dark' : 'light';
  return {
    ...base,
    ...(bgDef?.overrides?.[mode] ?? {}),
    ...(pcDef?.overrides?.[mode] ?? {}),
  };
}

export function applyThemeVars(
  primaryId: string,
  bgId: string,
  isDark: boolean,
  primaryCustomHex?: string,
  bgCustomHex?: string,
): void {
  const vars = buildThemeVars(primaryId, bgId, isDark, primaryCustomHex, bgCustomHex);
  const bg = resolveBg(bgId, bgCustomHex);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(`--${key}`, value);
  }
  root.style.setProperty('--bg-gradient', isDark ? bg.darkGradient : bg.lightGradient);
}
