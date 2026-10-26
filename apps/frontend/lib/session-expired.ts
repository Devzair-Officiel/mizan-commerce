/**
 * Fin de session, partagée par le client (lib/api-client.ts) et proxy.ts : code de la réponse 401
 * du proxy Next.js (lib/server-session.ts) et page de connexion qui suit, que proxy.ts ne renvoie
 * jamais vers /dashboard.
 */
export const SESSION_EXPIRED_CODE = 'session_expired';
export const SESSION_EXPIRED_LOGIN = '/login?session=expired';

export function isSessionExpired(data: unknown): boolean {
  return typeof data === 'object' && data !== null
    && (data as { code?: unknown }).code === SESSION_EXPIRED_CODE;
}
