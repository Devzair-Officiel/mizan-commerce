'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export function useLocaleSwitch() {
  const raw = useLocale();
  const current: Locale = isLocale(raw) ? raw : 'fr';
  const router = useRouter();

  function switchLocale(locale: Locale) {
    if (locale === current) return;
    writeLocaleCookie(locale);
    router.refresh();
  }

  return { current, switchLocale };
}
