import { NextRequest, NextResponse } from 'next/server';
import { refreshFailure, refreshSession, setSessionCookies } from '@/lib/server-session';

export async function POST(req: NextRequest) {
  const session = await refreshSession(req);
  if (session.status !== 'ok') return refreshFailure(session);

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, session);
  return response;
}
