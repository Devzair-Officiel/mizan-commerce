import { NextRequest, NextResponse } from 'next/server';
import { clientIpHeaders } from '@/lib/client-ip';
import {
  ACCESS_COOKIE, failed, refreshFailure, refreshSession, sessionExpired, setSessionCookies,
} from '@/lib/server-session';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';

/**
 * Deux photos (face, dos) de 8 Mo au plus chacune (le serveur reste seul juge), plus l'enveloppe
 * multipart : un envoi plus gros est refusé ici, sans être lu ni transmis.
 */
const MAX_BODY_BYTES = 2 * 8 * 1024 * 1024 + 64 * 1024;

/**
 * Scan d'emballage (URS-109) : proxy server-side vers `POST /ocr/product-scan/`. Le cookie
 * HttpOnly est lu ici et devient l'en-tête `Authorization` ; le corps multipart (photos) est
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
    headers: { 'Content-Type': contentType, ...clientIpHeaders(req.headers), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
  });

  const res = await send(req.cookies.get(ACCESS_COOKIE)?.value);
  if (res.status !== 401) return relay(res);

  // Token expiré : un rafraîchissement (partagé avec les requêtes simultanées), puis un seul
  // nouvel essai (le corps est déjà en mémoire).
  const session = await refreshSession(req);
  if (session.status !== 'ok') return refreshFailure(session);
  const retried = await send(session.access);
  if (retried.status === 401) {
    failed(req, { status: 'expired', cause: 'retry_rejected', backendStatus: 401 });
    return sessionExpired();
  }
  const response = await relay(retried);
  setSessionCookies(response, session);
  return response;
}

/** Réponse JSON du backend relayée ; tout autre corps (page d'erreur du serveur…) devient un 502 générique. */
async function relay(res: Response): Promise<NextResponse> {
  const data: unknown = await res.json().catch(() => undefined);
  if (data === undefined) {
    return NextResponse.json({ detail: "La lecture de l'image est indisponible pour le moment." }, { status: 502 });
  }
  return NextResponse.json(data, { status: res.status });
}
