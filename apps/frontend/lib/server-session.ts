import { NextResponse } from 'next/server';

import { clientIpHeaders } from './client-ip';

/**
 * Session côté serveur Next.js (route handlers uniquement) : cookies HttpOnly et rafraîchissement
 * du jeton d'accès. Le backend fait tourner le jeton de rafraîchissement et met l'ancien sur liste
 * noire : un jeton ne sert qu'une fois.
 *
 * Rafraîchissement « à vol unique » : les requêtes parties en même temps avec le même jeton
 * attendent la même demande au backend au lieu d'en envoyer chacune une (la deuxième, refusée,
 * déconnecterait l'utilisateur). Le résultat reste disponible REUSE_WINDOW_MS pour les requêtes
 * parties avec l'ancien cookie avant que le navigateur ne reçoive le nouveau.
 *
 * Limite : la mémoire est celle d'un processus Next.js. Avec plusieurs répliques, il faudrait
 * partager ces vols (Redis) ou une affinité de session.
 */

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const REUSE_WINDOW_MS = 60_000;
const REFRESH_TIMEOUT_MS = 10_000;

export interface SessionTokens {
  access: string;
  refresh: string;
}

/** ok : nouvelle paire ; expired : jeton refusé, session terminée ; unavailable : réessayer plus tard. */
export type RefreshResult = ({ status: 'ok' } & SessionTokens) | { status: 'expired' } | { status: 'unavailable' };

interface Flight {
  promise: Promise<RefreshResult>;
  settledAt?: number;
  /** Jeton de rafraîchissement issu de ce vol (pour `forgetRefresh`). */
  rotated?: string;
}

// Sur globalThis : les route handlers peuvent être compilés en modules séparés, une seule table par processus.
const FLIGHTS = Symbol.for('mizan.session.refreshFlights');
const holder = globalThis as typeof globalThis & { [FLIGHTS]?: Map<string, Flight> };
const flights: Map<string, Flight> = (holder[FLIGHTS] ??= new Map());

function prune(now: number): void {
  for (const [key, flight] of flights) {
    if (flight.settledAt !== undefined && now - flight.settledAt > REUSE_WINDOW_MS) flights.delete(key);
  }
}

async function requestRefresh(refresh: string, incoming: Headers): Promise<RefreshResult> {
  try {
    const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientIpHeaders(incoming) },
      body: JSON.stringify({ refresh }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    // 401 : jeton expiré, révoqué ou déjà utilisé ; 400 : jeton illisible.
    if (res.status === 401 || res.status === 400) return { status: 'expired' };
    if (!res.ok) return { status: 'unavailable' };
    const data: unknown = await res.json();
    if (typeof data === 'object' && data !== null) {
      const { access, refresh: rotated } = data as { access?: unknown; refresh?: unknown };
      if (typeof access === 'string' && typeof rotated === 'string') return { status: 'ok', access, refresh: rotated };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Rafraîchit la session : une seule demande au backend par jeton, partagée par les requêtes simultanées.
 * `incoming` : en-têtes de la requête du navigateur (adresse du visiteur, limite 'auth' par IP).
 */
export function refreshSession(refresh: string, incoming: Headers): Promise<RefreshResult> {
  prune(Date.now());
  const existing = flights.get(refresh);
  if (existing) return existing.promise;

  const flight: Flight = { promise: requestRefresh(refresh, incoming) };
  flights.set(refresh, flight);
  void flight.promise.then((result) => {
    if (flights.get(refresh) !== flight) return; // oublié entre-temps (déconnexion, mot de passe)
    if (result.status === 'unavailable') {
      flights.delete(refresh); // panne passagère : la requête suivante réessaie
      return;
    }
    flight.settledAt = Date.now();
    if (result.status === 'ok') flight.rotated = result.refresh;
  });
  return flight.promise;
}

/** Oublie les vols liés à ce jeton (comme clé ou comme résultat) : après une révocation, rien n'est réutilisé. */
export function forgetRefresh(refresh: string): void {
  for (const [key, flight] of flights) {
    if (key === refresh || flight.rotated === refresh) flights.delete(key);
  }
}

const COOKIE_OPTIONS = { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'lax', path: '/' } as const;

export function setSessionCookies(response: NextResponse, tokens: SessionTokens): void {
  response.cookies.set(ACCESS_COOKIE, tokens.access, { ...COOKIE_OPTIONS, maxAge: 60 * 60 });
  response.cookies.set(REFRESH_COOKIE, tokens.refresh, { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
}

/** Réponse d'un rafraîchissement impossible : session terminée (cookies effacés) ou service indisponible (gardés). */
export function refreshFailure(result: Exclude<RefreshResult, { status: 'ok' }>): NextResponse {
  if (result.status === 'unavailable') {
    return NextResponse.json({ detail: 'Service momentanément indisponible.' }, { status: 503 });
  }
  const response = NextResponse.json({ detail: 'Session expirée' }, { status: 401 });
  clearSessionCookies(response);
  return response;
}
