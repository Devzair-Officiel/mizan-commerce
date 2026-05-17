import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const accessToken = req.cookies.get('access_token')?.value;
  const endpoint = `${API_BASE}/${path.join('/')}`;
  const url = new URL(endpoint);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();

  const res = await fetch(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  // Token expired — try refresh
  if (res.status === 401) {
    const refreshToken = req.cookies.get('refresh_token')?.value;
    if (!refreshToken) {
      return NextResponse.json({ detail: 'Non authentifié' }, { status: 401 });
    }

    const refreshRes = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!refreshRes.ok) {
      const errResponse = NextResponse.json({ detail: 'Session expirée' }, { status: 401 });
      errResponse.cookies.delete('access_token');
      errResponse.cookies.delete('refresh_token');
      return errResponse;
    }

    const { access: newAccess } = await refreshRes.json();

    // Retry with new token
    const retryRes = await fetch(url.toString(), {
      method: req.method,
      headers: { ...headers, Authorization: `Bearer ${newAccess}` },
      body,
    });

    const retryData = retryRes.status === 204 ? null : await retryRes.json().catch(() => null);
    const response = NextResponse.json(retryData, { status: retryRes.status });

    const IS_PROD = process.env.NODE_ENV === 'production';
    response.cookies.set('access_token', newAccess, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    });

    return response;
  }

  if (res.status === 204) return new NextResponse(null, { status: 204 });

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
