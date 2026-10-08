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

export function LanguageSwitcher() {
  const tc = useTranslations('layout.common');
  const { current, switchLocale } = useLocaleSwitch();

  return (
    <div
      role="group"
      aria-label={tc('language')}
      className="flex gap-1 rounded-2xl bg-muted p-1"
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
            className={`flex-1 rounded-xl px-2 py-2 text-[13px] font-medium transition-all ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
            }`}
          >
            {LOCALE_LABELS[loc]}
          </button>
        );
      })}
    </div>
  );
}
