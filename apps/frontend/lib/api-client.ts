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
  // Strip leading slash for proxy path
  const cleanPath = path.replace(/^\//, '');
  const url = `/api/proxy/${cleanPath}`;

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
    throw new ApiError(res.status, data, `API error ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
