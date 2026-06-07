import { cookies } from 'next/headers';

import type { PublicPageData } from './public-page-types';

const API_BASE = process.env.API_URL ?? 'http://backend:8000/api';

/**
 * Récupère la page publique d'une boutique côté serveur Next.js.
 * `null` si la page n'existe pas, n'est pas publiée ou n'est pas active.
 *
 * Mode `preview` : transmet le cookie `access_token` au backend pour
 * autoriser un admin à voir sa propre page même non publiée. Réservé
 * à l'iframe d'aperçu dans l'éditeur.
 */
export async function fetchPublicPage(
  slug: string,
  options: { preview?: boolean } = {},
): Promise<PublicPageData | null> {
  const url = new URL(`${API_BASE}/public/boutique/${encodeURIComponent(slug)}/`);
  const headers: Record<string, string> = {};

  if (options.preview) {
    url.searchParams.set('preview', '1');
    const accessToken = (await cookies()).get('access_token')?.value;
    if (!accessToken) return null;
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url.toString(), { cache: 'no-store', headers });
  if (res.status === 404 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) {
    throw new Error(`Public page fetch failed: ${res.status}`);
  }
  return (await res.json()) as PublicPageData;
}
