'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@/lib/format';

/**
 * Hooks de formatage côté client.
 *
 * Chaque hook lit la locale active via `useLocale()` (fournie par
 * `NextIntlClientProvider` dans le RootLayout) et expose une fonction stable
 * pour un appel ergonomique : `const m = useFormatMoney(); m(123.4, 'EUR')`.
 *
 * Pour les Server Components, importer directement `formatMoney`/`formatDate`
 * depuis `@/lib/format` et passer la locale obtenue via `getLocale()`.
 */

function useResolvedLocale(): Locale {
  const raw = useLocale();
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export function useLocaleSafe(): Locale {
  return useResolvedLocale();
}

export function useFormatNumber() {
  const locale = useResolvedLocale();
  return useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, locale, options),
    [locale],
  );
}

export function useFormatMoney() {
  const locale = useResolvedLocale();
  return useCallback(
    (
      value: string | number,
      currency: string,
      options?: Parameters<typeof formatMoney>[3],
    ) => formatMoney(value, currency, locale, options),
    [locale],
  );
}

export function useFormatDate() {
  const locale = useResolvedLocale();
  return useCallback(
    (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDate(value, locale, options),
    [locale],
  );
}

export function useFormatDateTime() {
  const locale = useResolvedLocale();
  return useCallback(
    (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDateTime(value, locale, options),
    [locale],
  );
}

/**
 * Temps relatif (« à l'instant », « il y a 3 min »…) avec fallback locale.
 * Le texte « à l'instant » vient de `orders.rel.just_now` pour rester traduisible.
 */
export function useRelativeTime() {
  const locale = useResolvedLocale();
  const t = useTranslations('orders.rel');
  return useCallback(
    (iso: string): string => {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const diffMs = Date.now() - new Date(iso).getTime();
      const sec = Math.round(diffMs / 1000);
      if (sec < 60) return t('just_now');
      const min = Math.round(sec / 60);
      if (min < 60) return rtf.format(-min, 'minute');
      const hr = Math.round(min / 60);
      if (hr < 24) return rtf.format(-hr, 'hour');
      const day = Math.round(hr / 24);
      if (day < 7) return rtf.format(-day, 'day');
      if (day < 30) return rtf.format(-Math.round(day / 7), 'week');
      if (day < 365) return rtf.format(-Math.round(day / 30), 'month');
      return rtf.format(-Math.round(day / 365), 'year');
    },
    [locale, t],
  );
}

/**
 * Pour les cas où plusieurs formatages sont enchaînés dans le même rendu :
 * un seul appel `useFormat()` au lieu de 3-4 hooks.
 */
export function useFormat() {
  const locale = useResolvedLocale();
  return useMemo(
    () => ({
      locale,
      number: (v: number, o?: Intl.NumberFormatOptions) => formatNumber(v, locale, o),
      money: (
        v: string | number,
        c: string,
        o?: Parameters<typeof formatMoney>[3],
      ) => formatMoney(v, c, locale, o),
      date: (v: string | number | Date, o?: Intl.DateTimeFormatOptions) =>
        formatDate(v, locale, o),
      dateTime: (v: string | number | Date, o?: Intl.DateTimeFormatOptions) =>
        formatDateTime(v, locale, o),
    }),
    [locale],
  );
}
