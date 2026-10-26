import { SESSION_EXPIRED_LOGIN, isSessionExpired } from './session-expired';

/** Code renvoyé par le backend quand la boutique d'un employé ou d'un admin n'a plus Boutique. */
const STAFF_SUSPENDED_CODE = 'staff_suspended_plan';
export const SUSPENDED_PATH = '/suspended';

export function isStaffSuspended(data: unknown): boolean {
  return typeof data === 'object' && data !== null
    && (data as { code?: unknown }).code === STAFF_SUSPENDED_CODE;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
    message: string,
  ) {
    super(message);
  }
}

/** Chemin de l'API → URL du proxy Next.js, avec un seul slash final. */
function proxyUrl(path: string): string {
  // Strip leading slash
  const stripped = path.replace(/^\//, '');
  // Separate path from query string
  const qIdx = stripped.indexOf('?');
  const pathOnly = qIdx === -1 ? stripped : stripped.slice(0, qIdx);
  const query = qIdx !== -1 ? stripped.slice(qIdx) : ''; // '' or '?foo=bar'
  // Le proxy ajoute déjà le slash final — on s'assure juste de ne pas en doubler
  const cleanPath = pathOnly.endsWith('/') ? pathOnly : `${pathOnly}/`;
  // N'ajouter le query que s'il contient vraiment des params (pas juste '?')
  return `/api/proxy/${cleanPath}${query.length > 1 ? query : ''}`;
}

/** Une seule sortie vers /login par page, même si plusieurs requêtes échouent ensemble. */
let leavingSession = false;

/**
 * Session terminée (401 `session_expired` : le proxy a déjà tenté le rafraîchissement et effacé les
 * cookies) : une seule navigation vers la page de connexion, qui remplace la page courante (le
 * retour arrière ne ramène pas sur une page de l'application) et que proxy.ts ne renvoie jamais
 * vers /dashboard. Pas de navigation depuis /login, ni sur un autre 401 : aucune boucle possible.
 */
function leaveSession(data: unknown): void {
  if (leavingSession || !isSessionExpired(data) || window.location.pathname.startsWith('/login')) return;
  leavingSession = true;
  window.location.replace(SESSION_EXPIRED_LOGIN);
}

/** Session expirée, accès suspendu ou erreur de l'API : `ApiError` (corps JSON s'il y en a un). */
async function throwIfFailed(res: Response): Promise<void> {
  if (res.status === 401) {
    const data: unknown = await res.json().catch(() => null);
    leaveSession(data);
    throw new ApiError(401, data, 'Session expirée');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // Accès suspendu : seul l'écran dédié s'affiche, quelle que soit la page en cours.
    if (res.status === 403 && isStaffSuspended(data) && window.location.pathname !== SUSPENDED_PATH) {
      window.location.href = SUSPENDED_PATH;
    }
    throw new ApiError(res.status, data, `API error ${res.status}`);
  }
}

/**
 * Toutes les requêtes passent par le proxy Next.js (/api/proxy/...).
 * Le token JWT est stocké dans un cookie HttpOnly côté serveur — jamais
 * accessible depuis le JS client.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(proxyUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  await throwIfFailed(res);

  // 204 No Content — l'appelant doit typer comme apiFetch<void>(...)
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

/** Nom proposé par le serveur (`Content-Disposition`), sinon `fallback`. */
function attachmentName(header: string | null, fallback: string): string {
  const encoded = header?.match(/filename\*=utf-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return header?.match(/filename="([^"]+)"/)?.[1] ?? fallback;
}

/** Fichier (PDF…) par le même proxy, avec les mêmes erreurs que `apiFetch` ; nommé comme le propose le serveur. */
export async function apiFetchFile(path: string, fallbackName: string): Promise<File> {
  const res = await fetch(proxyUrl(path));
  await throwIfFailed(res);
  const blob = await res.blob();
  return new File([blob], attachmentName(res.headers.get('Content-Disposition'), fallbackName), { type: blob.type });
}
