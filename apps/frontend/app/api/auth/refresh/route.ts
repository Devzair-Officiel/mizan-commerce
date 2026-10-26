import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE, refreshFailure, refreshSession, setSessionCookies } from '@/lib/server-session';

export async function POST(req: NextRequest) {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    return NextResponse.json({ detail: 'No refresh token' }, { status: 401 });
  }

  const session = await refreshSession(refresh, req.headers);
  if (session.status !== 'ok') return refreshFailure(session);

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, session);
  return response;
}
