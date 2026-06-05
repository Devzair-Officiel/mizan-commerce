import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locales';

/**
 * Loader serveur next-intl.
 *
 * Résolution de la locale dans cet ordre :
 *  1. Cookie `NEXT_LOCALE` (posé par `proxy.ts` après détection ou par le
 *     toggle utilisateur — source de vérité une fois l'utilisateur a choisi).
 *  2. En-tête `Accept-Language` brut (fallback ; le proxy le pré-décode pour
 *     les pages, mais cette route protège les RSC isolées et les rendus de
 *     test).
 *  3. `DEFAULT_LOCALE` (fr) en dernier recours.
 *
 * Les catalogues vivent dans `messages/<locale>.json`. Ils sont importés en
 * dynamique pour qu'un seul soit chargé par requête (le bundle initial reste
 * léger même quand on ajoutera des centaines de clés).
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale = DEFAULT_LOCALE;
  if (isLocale(fromCookie)) {
    locale = fromCookie;
  } else {
    const acceptLanguage = (await headers()).get('accept-language') ?? '';
    const detected = pickFromAcceptLanguage(acceptLanguage);
    if (detected) locale = detected;
  }

  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages };
});

function pickFromAcceptLanguage(header: string): Locale | null {
  // Découpe brute "fr-FR,fr;q=0.9,en;q=0.8" → ["fr-FR","fr","en"]
  const tags = header
    .split(',')
    .map((entry) => entry.split(';')[0]?.trim().toLowerCase())
    .filter((tag): tag is string => !!tag);

  for (const tag of tags) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return null;
}
