import { NextResponse, type NextRequest } from 'next/server';

/**
 * Garde-fou serveur : redirige les pages applicatives non authentifiées vers `/login`,
 * et inversement renvoie un utilisateur déjà connecté vers `/dashboard` s'il atterrit
 * sur les écrans d'auth.
 *
 * On vérifie uniquement la présence du cookie `access_token` (HttpOnly, posé par
 * `/api/auth/login`). C'est un check optimiste : la véritable autorisation reste
 * côté Django (chaque appel via le proxy `/api/proxy/*` est validé serveur). Une
 * couche supplémentaire de défense en profondeur — pas un mécanisme de sécurité
 * à elle seule.
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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('access_token');
  const onAuthPage = PUBLIC_AUTH_PREFIXES.some((p) => pathname.startsWith(p));

  if (!hasSession && !onAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Encoder la destination originale pour redirection post-login.
    if (pathname !== '/') {
      url.searchParams.set('next', pathname + search);
    } else {
      url.searchParams.delete('next');
    }
    return NextResponse.redirect(url);
  }

  if (hasSession && onAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Exclure les routes API, fichiers statiques Next, optimisation d'images, et favicons.
  // Ne JAMAIS inclure `/api/*` (sinon on rentre en boucle sur les routes d'auth elles-mêmes).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
