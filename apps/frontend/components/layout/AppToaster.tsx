'use client';

import type { CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Toaster } from 'sonner';
import { getDirection, type Locale } from '@/i18n/locales';
import { useIsDesktop } from '@/lib/hooks/useMediaQuery';

/** Mobile : au-dessus de la barre du bas et d'un éventuel bouton flottant (h-12). */
const MOBILE_OFFSET = { bottom: 'calc(var(--bottom-nav-h) + var(--sell-overflow) + 4rem)', left: '1rem', right: '1rem' };
const DESKTOP_OFFSET = { bottom: '1.5rem', left: '1.5rem', right: '1.5rem' };

/** Couleurs des tokens : sonner les lit dans ces variables (clair et sombre suivent le thème). */
const TOKEN_STYLE = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius-xl)',
  fontFamily: 'inherit',
} as CSSProperties;

/**
 * Notifications de l'app (sonner), une seule instance dans le layout. Annoncées par la région
 * `aria-live="polite"` de sonner. Desktop : en bas à droite (à gauche en arabe) ; mobile : en bas.
 */
export function AppToaster() {
  const t = useTranslations('ui.toast');
  const locale = useLocale() as Locale;
  const { resolvedTheme } = useTheme();
  const isDesktop = useIsDesktop() ?? false;
  const dir = getDirection(locale);
  const offset = isDesktop ? DESKTOP_OFFSET : MOBILE_OFFSET;

  return (
    <Toaster
      dir={dir}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position={isDesktop ? (dir === 'rtl' ? 'bottom-left' : 'bottom-right') : 'bottom-center'}
      offset={offset}
      mobileOffset={offset}
      containerAriaLabel={t('region')}
      style={TOKEN_STYLE}
      toastOptions={{ className: 'text-sm' }}
      icons={{
        success: <CircleCheck size={16} className="text-primary" aria-hidden />,
        error: <CircleAlert size={16} className="text-red-700 dark:text-red-400" aria-hidden />,
      }}
    />
  );
}
