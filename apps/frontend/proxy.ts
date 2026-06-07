import { NextResponse, type NextRequest } from 'next/server';

import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, isLocale, type Locale } from '@/i18n/locales';

/**
 * Garde-fou serveur — deux responsabilités :
 *
 * 1. **Auth gate** : redirige les pages applicatives non authentifiées vers
 *    `/login`, et renvoie un utilisateur déjà connecté vers `/dashboard` s'il
 *    atterrit sur les écrans d'auth. Check optimiste basé sur la présence du
 *    cookie `access_token` (HttpOnly, posé par `/api/auth/login`). La vraie
 *    autorisation reste côté Django.
 *
 * 2. **Locale bootstrap** : à la première visite, si l'utilisateur n'a pas
 *    encore de cookie `NEXT_LOCALE`, on détecte la langue préférée via
 *    `Accept-Language` et on pose le cookie. Les visites suivantes (et le
 *    rendu serveur) lisent ce cookie via `i18n/request.ts`. Le toggle dans
 *    le BurgerMenu écrasera ce cookie côté client.
 *
 * Next.js 16 a renommé `middleware.ts` en `proxy.ts`.
 */

const PUBLIC_AUTH_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

// Pages publiques sans auth (vitrines boutiques publiées).
const PUBLIC_PAGE_PREFIXES = ['/boutique/'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('access_token');
  const onAuthPage = PUBLIC_AUTH_PREFIXES.some((p) => pathname.startsWith(p));
  const onPublicPage = PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p));

  if (onPublicPage) {
    return applyLocaleCookie(NextResponse.next(), request);
  }

  // --- 1. Redirections d'auth ---------------------------------------------
  if (!hasSession && !onAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') {
      url.searchParams.set('next', pathname + search);
    } else {
      url.searchParams.delete('next');
    }
    return applyLocaleCookie(NextResponse.redirect(url), request);
  }

  if (hasSession && onAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return applyLocaleCookie(NextResponse.redirect(url), request);
  }

  // --- 2. Pass-through + bootstrap éventuel du cookie de locale -----------
  return applyLocaleCookie(NextResponse.next(), request);
}

/**
 * Pose `NEXT_LOCALE` côté réponse si l'utilisateur n'en a pas déjà un.
 * Idempotent : si le cookie existe déjà (toggle utilisateur ou visite
 * précédente), on ne le touche pas.
 */
function applyLocaleCookie(response: NextResponse, request: NextRequest): NextResponse {
  const existing = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(existing)) return response;

  const detected = detectLocaleFromAcceptLanguage(
    request.headers.get('accept-language') ?? '',
  );

  response.cookies.set(LOCALE_COOKIE, detected, {
    path: '/',
    sameSite: 'lax',
    // 1 an — le toggle utilisateur écrasera la valeur de toute façon.
    maxAge: 60 * 60 * 24 * 365,
    // Lisible côté client : le LanguageSwitcher doit pouvoir l'écrire.
    httpOnly: false,
  });
  return response;
}

function detectLocaleFromAcceptLanguage(header: string): Locale {
  // "fr-FR,fr;q=0.9,en;q=0.8" → on prend chaque tag dans l'ordre (Accept-Language
  // est déjà priorisé par le navigateur), on ramène à la base et on retient la
  // première qui matche la liste supportée.
  const tags = header
    .split(',')
    .map((entry) => entry.split(';')[0]?.trim().toLowerCase())
    .filter((tag): tag is string => !!tag);

  for (const tag of tags) {
    const base = tag.split('-')[0];
    if (base && (LOCALES as readonly string[]).includes(base)) {
      return base as Locale;
    }
  }
  return DEFAULT_LOCALE;
}

export const config = {
  // Exclure routes API, statiques Next, optimisation d'images, favicons.
  // Ne JAMAIS inclure `/api/*` (boucle sur les routes d'auth elles-mêmes).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
