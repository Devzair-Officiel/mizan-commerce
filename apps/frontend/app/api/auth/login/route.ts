import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';
const IS_PROD = process.env.NODE_ENV === 'production';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ detail: 'Corps invalide.' }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return NextResponse.json(
      { detail: `Impossible de joindre le backend (${API_BASE}).` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { detail: 'Email ou mot de passe incorrect.' },
      { status: res.status },
    );
  }

  const { access, refresh } = await res.json();

  const response = NextResponse.json({ ok: true });

  response.cookies.set('access_token', access, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1h
  });

  response.cookies.set('refresh_token', refresh, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30j
  });

  return response;
}
