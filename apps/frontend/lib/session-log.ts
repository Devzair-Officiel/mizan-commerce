import type { RefreshFailure } from './refresh-flights';

/**
 * Journal des renouvellements de session (sortie du conteneur frontend), une ligne JSON par
 * événement. Ne contient JAMAIS de jeton, de valeur de cookie, d'e-mail ni d'empreinte : seulement
 * la cause, le statut et le code du backend, le chemin appelant (sans requête, segments douteux
 * masqués) et la présence de chaque cookie de session.
 * Sans import de Next.js : testé par `node --test` (lib/session-security.test.mjs).
 */

export type SessionEvent = 'session_refresh_failed' | 'session_refresh_graced';

export interface RequestSummary {
  path: string;
  access_cookie: boolean;
  refresh_cookie: boolean;
  /** Plusieurs cookies du même nom (autre chemin ou domaine) : l'effacement ne peut pas tous les atteindre. */
  access_cookie_duplicated: boolean;
  refresh_cookie_duplicated: boolean;
}

/** Segment sûr à journaliser : identifiant, slug ou UUID. Le reste (e-mail, jeton…) est masqué. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,40}$/;
const SAFE_CODE = /^[a-z_]{1,64}$/;

/** Résumé d'une requête : chemin sans valeur douteuse, cookies comptés par leur seul nom. */
export function summarizeRequest(pathname: string, cookieHeader: string | null): RequestSummary {
  const path = pathname.split('/').map((s) => (s === '' || SAFE_SEGMENT.test(s) ? s : '-')).join('/').slice(0, 200);
  const count = (name: string) => (cookieHeader ?? '').split(';').filter((part) => part.split('=')[0]?.trim() === name).length;
  const access = count('access_token');
  const refresh = count('refresh_token');
  return {
    path,
    access_cookie: access > 0,
    refresh_cookie: refresh > 0,
    access_cookie_duplicated: access > 1,
    refresh_cookie_duplicated: refresh > 1,
  };
}

export function logRefreshFailed(request: RequestSummary, failure: RefreshFailure): void {
  const code = failure.backendCode && SAFE_CODE.test(failure.backendCode) ? failure.backendCode : undefined;
  console.warn(JSON.stringify({
    event: 'session_refresh_failed' satisfies SessionEvent,
    cause: failure.cause,
    outcome: failure.status,
    backend_status: failure.backendStatus ?? null,
    backend_code: code ?? null,
    ...request,
  }));
}

export function logRefreshGraced(request: RequestSummary): void {
  console.info(JSON.stringify({ event: 'session_refresh_graced' satisfies SessionEvent, cause: 'grace_window', ...request }));
}
