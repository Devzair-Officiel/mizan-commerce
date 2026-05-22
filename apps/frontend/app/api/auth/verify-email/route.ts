import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/verify-email/?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}`);
  } catch {
    return NextResponse.json({ detail: 'Impossible de joindre le backend.' }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
