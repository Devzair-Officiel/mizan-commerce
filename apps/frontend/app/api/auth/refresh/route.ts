import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';
const SECURE_COOKIES = process.env.COOKIE_SECURE === 'true';

export async function POST(req: NextRequest) {
  const refresh = req.cookies.get('refresh_token')?.value;
  if (!refresh) {
    return NextResponse.json({ detail: 'No refresh token' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    const response = NextResponse.json({ detail: 'Session expirée' }, { status: 401 });
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
    return response;
  }

  const { access } = await res.json();
  const response = NextResponse.json({ ok: true });
  response.cookies.set('access_token', access, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });

  return response;
}
