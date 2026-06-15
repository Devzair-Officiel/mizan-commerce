import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ detail: 'Corps invalide.' }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json({ detail: 'Impossible de joindre le backend.' }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const { access, refresh, ...rest } = data ?? {};

  // Auto-connexion : si le backend a retourné les tokens (cas normal d'inscription),
  // on pose les cookies HttpOnly directement et on ne renvoie jamais les tokens
  // au client. Sans tokens (cas inattendu) on retombe sur la réponse brute.
  if (typeof access === 'string' && typeof refresh === 'string') {
    const response = NextResponse.json({ ok: true, ...rest }, { status: res.status });

    response.cookies.set('access_token', access, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1h
    });

    response.cookies.set('refresh_token', refresh, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30j
    });

    return response;
  }

  return NextResponse.json(data, { status: res.status });
}
