'use client';

import { useTranslations } from 'next-intl';
import { LOCALES, type Locale } from '@/i18n/locales';
import { useLocaleSwitch } from '@/lib/hooks/useLocaleSwitch';

/**
 * Switcher de langue affiché en permanence dans le BurgerMenu (préférence
 * utilisateur — choix produit confirmé d'avoir le toggle toujours visible).
 *
 * Mécanique : on écrit le cookie `NEXT_LOCALE` côté client (httpOnly: false
 * volontairement, posé par `proxy.ts` avec ce flag pour exactement ce cas)
 * puis on déclenche un `router.refresh()`. Le RootLayout re-rend en lisant
 * la nouvelle locale via `getLocale()` (next-intl/server), bascule
 * `<html lang>` et `<html dir>` côté serveur — pas de flash de FOUC.
 *
 * Labels en script natif : un utilisateur arabophone reconnaît « العربية »
 * sans connaître le français. Plus discoverable que des codes ISO.
 */

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
};

/** Libellés courts du pied de la sidebar desktop ; le nom complet reste lu par les lecteurs d'écran. */
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  fr: 'FR',
  ar: 'ع',
  en: 'EN',
};

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const tc = useTranslations('layout.common');
  const { current, switchLocale } = useLocaleSwitch();

  return (
    <div
      role="group"
      aria-label={tc('language')}
      className="flex gap-1 rounded-[0.875rem] bg-muted p-1"
    >
      {LOCALES.map((loc) => {
        const active = current === loc;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => switchLocale(loc)}
            aria-pressed={active}
            lang={loc}
            aria-label={compact ? LOCALE_LABELS[loc] : undefined}
            className={`flex-1 ${compact ? 'h-7' : 'h-9.5'} flex items-center justify-center rounded-[0.625rem] px-2 text-[13px] font-medium transition-all ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            }`}
          >
            {compact ? LOCALE_SHORT_LABELS[loc] : LOCALE_LABELS[loc]}
          </button>
        );
      })}
    </div>
  );
}
