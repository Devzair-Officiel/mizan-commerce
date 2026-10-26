import { NextResponse, type NextRequest } from 'next/server';

import { clientIpHeaders } from './client-ip';
import { RefreshFlights, type RefreshFailure, type RefreshResult, type SessionTokens } from './refresh-flights';
import { SESSION_EXPIRED_CODE } from './session-expired';
import { logRefreshFailed, logRefreshGraced, summarizeRequest } from './session-log';

/**
 * Session côté serveur Next.js (route handlers et proxy.ts) : cookies HttpOnly et rafraîchissement
 * du jeton d'accès. Le backend fait tourner le jeton de rafraîchissement et met l'ancien sur liste
 * noire : un jeton ne sert qu'une fois. Vol unique et fenêtre de grâce de 30 s : voir refresh-flights.ts.
 *
 * Un échec définitif (jeton refusé, absent) termine la session : 401 `session_expired`, les deux
 * cookies effacés. Chaque échec et chaque passage par la fenêtre de grâce est journalisé (session-log.ts).
 *
 * Limite : la mémoire est celle d'un processus Next.js. Avec plusieurs répliques, il faudrait
 * partager ces vols (Redis) ou une affinité de session.
 */

export type { RefreshResult, SessionTokens };

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const REFRESH_TIMEOUT_MS = 10_000;

// Sur globalThis : les route handlers peuvent être compilés en modules séparés, une seule table par processus.
const FLIGHTS = Symbol.for('mizan.session.refreshFlights.v2');
const holder = globalThis as typeof globalThis & { [FLIGHTS]?: RefreshFlights };
const flights: RefreshFlights = (holder[FLIGHTS] ??= new RefreshFlights());

async function requestRefresh(refresh: string, incoming: Headers): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientIpHeaders(incoming) },
      body: JSON.stringify({ refresh }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch {
    return { status: 'unavailable', cause: 'unreachable' };
  }
  const data: unknown = await res.json().catch(() => null);
  const fields = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const backendCode = typeof fields.code === 'string' ? fields.code : undefined;
  // 401 : jeton expiré, révoqué ou déjà utilisé ; 400 : jeton illisible.
  if (res.status === 401 || res.status === 400) {
    return { status: 'expired', cause: 'rejected', backendStatus: res.status, backendCode };
  }
  if (res.ok && typeof fields.access === 'string' && typeof fields.refresh === 'string') {
    return { status: 'ok', access: fields.access, refresh: fields.refresh };
  }
  return { status: 'unavailable', cause: 'backend_error', backendStatus: res.status, backendCode };
}

/**
 * Rafraîchit la session de `req` (cookie de rafraîchissement) : une seule demande au backend par
 * jeton, partagée par les requêtes simultanées, puis gardée 30 s pour l'ancien cookie.
 */
export async function refreshSession(req: NextRequest): Promise<RefreshResult> {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) return failed(req, { status: 'expired', cause: 'no_refresh_cookie' });

  const { promise, graced } = flights.run(refresh, () => requestRefresh(refresh, req.headers));
  const result = await promise;
  if (result.status !== 'ok') return failed(req, result);
  if (graced) logRefreshGraced(summarize(req));
  return result;
}

/** Échec journalisé (sans valeur sensible) puis renvoyé. */
export function failed(req: NextRequest, failure: RefreshFailure): RefreshFailure {
  logRefreshFailed(summarize(req), failure);
  return failure;
}

function summarize(req: NextRequest) {
  return summarizeRequest(req.nextUrl.pathname, req.headers.get('cookie'));
}

/** Oublie les vols liés à ce jeton : après une révocation, rien n'est réutilisé. */
export function forgetRefresh(refresh: string): void {
  flights.forget(refresh);
}

const COOKIE_OPTIONS = { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'lax', path: '/' } as const;

export function setSessionCookies(response: NextResponse, tokens: SessionTokens): void {
  response.cookies.set(ACCESS_COOKIE, tokens.access, { ...COOKIE_OPTIONS, maxAge: 60 * 60 });
  response.cookies.set(REFRESH_COOKIE, tokens.refresh, { ...COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 30 });
}

/** Effacement avec les attributs de la pose : le navigateur remplace exactement les mêmes cookies. */
export function clearSessionCookies(response: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    response.cookies.set(name, '', { ...COOKIE_OPTIONS, maxAge: 0, expires: new Date(0) });
  }
}

/** Session terminée : 401 `session_expired`, cookies effacés. */
export function sessionExpired(): NextResponse {
  const response = NextResponse.json({ detail: 'Session expirée', code: SESSION_EXPIRED_CODE }, { status: 401 });
  clearSessionCookies(response);
  return response;
}

/** Réponse d'un rafraîchissement impossible : session terminée (cookies effacés) ou service indisponible (gardés). */
export function refreshFailure(result: RefreshFailure): NextResponse {
  if (result.status === 'unavailable') {
    return NextResponse.json({ detail: 'Service momentanément indisponible.' }, { status: 503 });
  }
  return sessionExpired();
}
