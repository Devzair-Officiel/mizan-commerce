'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { LOCALES, LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales';

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

const LABELS: Record<Locale, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
};

// 1 an — le pose à chaque visite via proxy renouvelle la fraîcheur du cookie.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Helper module-level : la règle `react-hooks/immutability` interdit la
// mutation directe de `document.cookie` dans le corps d'un composant. Sortir
// l'écriture ici clarifie qu'on parle bien d'un side-effect navigateur, pas
// d'un état React.
function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function LanguageSwitcher() {
  const tc = useTranslations('layout.common');
  const raw = useLocale();
  const current: Locale = isLocale(raw) ? raw : 'fr';
  const router = useRouter();

  function pick(locale: Locale) {
    if (locale === current) return;
    writeLocaleCookie(locale);
    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label={tc('language')}
      className="flex gap-1 rounded-2xl bg-white/10 p-1"
    >
      {LOCALES.map((loc) => {
        const active = current === loc;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => pick(loc)}
            aria-pressed={active}
            lang={loc}
            className={`flex-1 rounded-xl px-2 py-2 text-[13px] font-medium transition-all ${
              active
                ? 'bg-white text-primary shadow-sm'
                : 'text-white/75 hover:text-white hover:bg-white/10'
            }`}
          >
            {LABELS[loc]}
          </button>
        );
      })}
    </div>
  );
}
