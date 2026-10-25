import { NextRequest, NextResponse } from 'next/server';
import { clientIpHeaders } from '@/lib/client-ip';
import {
  ACCESS_COOKIE, REFRESH_COOKIE, forgetRefresh, refreshFailure, refreshSession, setSessionCookies,
} from '@/lib/server-session';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';
/** Le backend ferme toutes les sessions et renvoie une nouvelle paire de jetons (voir relayPasswordChange). */
const PASSWORD_CHANGE_PATH = 'auth/change-password';

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  // Next.js strip le slash final des segments [..path] — on le réajoute pour Django APPEND_SLASH
  const pathStr = path.join('/');
  const endpoint = `${API_BASE}/${pathStr}/`;
  const url = new URL(endpoint);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const isMultipart = req.headers.get('content-type')?.startsWith('multipart/form-data');

  const headers: Record<string, string> = clientIpHeaders(req.headers);
  if (!isMultipart) headers['Content-Type'] = 'application/json';

  // Pour multipart, on forward les headers d'origine (inclut le boundary)
  if (isMultipart) {
    const ct = req.headers.get('content-type');
    if (ct) headers['Content-Type'] = ct;
  }

  let body: BodyInit | undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    body = isMultipart ? await req.arrayBuffer() : await req.text();
  }

  const send = (token: string | undefined) => fetch(url.toString(), {
    method: req.method,
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  });
  const finish = (res: Response) => (pathStr === PASSWORD_CHANGE_PATH ? relayPasswordChange(req, res) : relay(res));

  const res = await send(accessToken);
  if (res.status !== 401) return finish(res);

  // Jeton d'accès expiré : rafraîchissement (partagé avec les requêtes simultanées), puis un seul
  // nouvel essai (le corps est déjà en mémoire).
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ detail: 'Non authentifié' }, { status: 401 });
  }
  const session = await refreshSession(refreshToken, req.headers);
  if (session.status !== 'ok') return refreshFailure(session);

  const response = await finish(await send(session.access));
  // Un changement de mot de passe a déjà posé sa propre paire, plus récente.
  if (!response.cookies.has(REFRESH_COOKIE)) setSessionCookies(response, session);
  return response;
}

/**
 * Changement de mot de passe : le backend révoque toutes les sessions et renvoie une nouvelle paire
 * pour celle-ci. Elle devient les cookies HttpOnly et ne figure jamais dans le JSON relayé.
 */
async function relayPasswordChange(req: NextRequest, res: Response): Promise<NextResponse> {
  const data: unknown = await res.json().catch(() => null);
  if (typeof data !== 'object' || data === null) return NextResponse.json(data, { status: res.status });
  const { access, refresh, ...rest } = data as { access?: unknown; refresh?: unknown };
  const response = NextResponse.json(rest, { status: res.status });
  if (res.ok && typeof access === 'string' && typeof refresh === 'string') {
    setSessionCookies(response, { access, refresh });
    const previous = req.cookies.get(REFRESH_COOKIE)?.value;
    if (previous) forgetRefresh(previous);
  }
  return response;
}

/**
 * Réponse du backend relayée au navigateur. Hors JSON (PDF, image, CSV…), le corps est transmis
 * en flux, avec son content-type et son content-disposition : un export n'est pas mis en mémoire.
 */
async function relay(res: Response): Promise<NextResponse> {
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const headers = new Headers();
    headers.set('content-type', contentType);
    const disposition = res.headers.get('content-disposition');
    if (disposition) headers.set('content-disposition', disposition);
    return new NextResponse(res.body, { status: res.status, headers });
  }
  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
