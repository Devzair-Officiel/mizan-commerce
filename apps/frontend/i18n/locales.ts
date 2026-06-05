/**
 * Locales supportées par l'application.
 *
 * `fr` est la locale par défaut (cible historique : commerçants francophones).
 * `ar` est marquée RTL et déclenche `<html dir="rtl">`.
 *
 * Le choix de la locale est persisté côté client via le cookie `NEXT_LOCALE`
 * (lu par `next-intl` côté serveur, posé par `proxy.ts` lors de la première
 * visite via détection `Accept-Language`).
 */

export const LOCALES = ['fr', 'ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';

export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar']);

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
