/** Code renvoyé par le backend quand la boutique d'un employé ou d'un admin n'a plus Boutique+. */
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

/**
 * Toutes les requêtes passent par le proxy Next.js (/api/proxy/...).
 * Le token JWT est stocké dans un cookie HttpOnly côté serveur — jamais
 * accessible depuis le JS client.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Strip leading slash
  const stripped = path.replace(/^\//, '');
  // Separate path from query string
  const qIdx = stripped.indexOf('?');
  const pathOnly = qIdx === -1 ? stripped : stripped.slice(0, qIdx);
  const query = qIdx !== -1 ? stripped.slice(qIdx) : ''; // '' or '?foo=bar'
  // Le proxy ajoute déjà le slash final — on s'assure juste de ne pas en doubler
  const cleanPath = pathOnly.endsWith('/') ? pathOnly : `${pathOnly}/`;
  // N'ajouter le query que s'il contient vraiment des params (pas juste '?')
  const url = `/api/proxy/${cleanPath}${query.length > 1 ? query : ''}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });

  if (res.status === 401) {
    // Le proxy a déjà tenté le refresh — session vraiment expirée
    window.location.href = '/login';
    throw new ApiError(401, null, 'Session expirée');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // Accès suspendu : seul l'écran dédié s'affiche, quelle que soit la page en cours.
    if (res.status === 403 && isStaffSuspended(data) && window.location.pathname !== SUSPENDED_PATH) {
      window.location.href = SUSPENDED_PATH;
    }
    throw new ApiError(res.status, data, `API error ${res.status}`);
  }

  // 204 No Content — l'appelant doit typer comme apiFetch<void>(...)
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}
