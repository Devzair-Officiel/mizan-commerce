import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';

/**
 * Photo de 8 Mo au plus (le serveur reste seul juge), plus l'enveloppe multipart : un envoi plus
 * gros est refusé ici, sans être lu ni transmis.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024 + 64 * 1024;

/**
 * Scan d'emballage (URS-109) : proxy server-side vers `POST /ocr/product-scan/`. Le cookie
 * HttpOnly est lu ici et devient l'en-tête `Authorization` ; le corps multipart (photo) est
 * transmis tel quel, avec son boundary, et n'est ni stocké ni journalisé. Le token n'atteint
 * jamais le navigateur.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json({ detail: 'Requête invalide.' }, { status: 400 });
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: 'Requête invalide.', code: 'too_large' }, { status: 400 });
  }
  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: 'Requête invalide.', code: 'too_large' }, { status: 400 });
  }

  const send = (token: string | undefined) => fetch(`${API_BASE}/ocr/product-scan/`, {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  });

  const res = await send(req.cookies.get('access_token')?.value);
  if (res.status !== 401) return relay(res);

  // Token expiré : un rafraîchissement, puis un seul nouvel essai (le corps est déjà en mémoire).
  const newAccess = await refreshAccess(req.cookies.get('refresh_token')?.value);
  if (!newAccess) {
    const expired = NextResponse.json({ detail: 'Session expirée' }, { status: 401 });
    expired.cookies.delete('access_token');
    expired.cookies.delete('refresh_token');
    return expired;
  }
  const response = await relay(await send(newAccess));
  response.cookies.set('access_token', newAccess, {
    httpOnly: true, secure: SECURE_COOKIES, sameSite: 'lax', path: '/', maxAge: 60 * 60,
  });
  return response;
}

async function refreshAccess(refresh: string | undefined): Promise<string | null> {
  if (!refresh) return null;
  const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return null;
  const data: unknown = await res.json().catch(() => null);
  const access = typeof data === 'object' && data !== null ? (data as { access?: unknown }).access : undefined;
  return typeof access === 'string' ? access : null;
}

/** Réponse JSON du backend relayée ; tout autre corps (page d'erreur du serveur…) devient un 502 générique. */
async function relay(res: Response): Promise<NextResponse> {
  const data: unknown = await res.json().catch(() => undefined);
  if (data === undefined) {
    return NextResponse.json({ detail: "La lecture de l'image est indisponible pour le moment." }, { status: 502 });
  }
  return NextResponse.json(data, { status: res.status });
}
