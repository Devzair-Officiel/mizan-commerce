import { NextRequest, NextResponse } from 'next/server';
import { clientIpHeaders } from '@/lib/client-ip';
import { REFRESH_COOKIE, clearSessionCookies, forgetRefresh } from '@/lib/server-session';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';

/**
 * Déconnexion : le jeton de rafraîchissement passe sur liste noire côté backend, puis les cookies
 * sont effacés. La liste noire est au mieux : backend injoignable ou jeton déjà invalide, les
 * cookies sont effacés quand même.
 */
export async function POST(req: NextRequest) {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    await fetch(`${API_BASE}/auth/logout/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientIpHeaders(req.headers) },
      body: JSON.stringify({ refresh }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    forgetRefresh(refresh);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
