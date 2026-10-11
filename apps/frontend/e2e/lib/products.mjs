import { BASE } from './session.mjs';

/** Appel du backend par le proxy Next.js, avec la session du navigateur. */
export async function api(page, path, { method = 'GET', data } = {}) {
  const res = await page.request.fetch(`${BASE}/api/proxy/${path}`, { method, data });
  if (!res.ok()) throw new Error(`${method} ${path} : ${res.status()} ${(await res.text()).slice(0, 200)}`);
  return res.status() === 204 ? null : res.json();
}

/** Toutes les pages d'une liste paginée (20 par page). */
export async function allResults(page, path) {
  const out = [];
  for (let n = 1; ; n += 1) {
    const data = await api(page, `${path}${path.includes('?') ? '&' : '?'}page=${n}`);
    out.push(...data.results);
    if (!data.next) return out;
  }
}

/** Article à un format, avec un stock initial facultatif. */
export async function createArticle(page, { name, price, threshold = '', stock = 0, variants = ['Par défaut'] }) {
  const product = await api(page, 'products/', { method: 'POST', data: { name, type: 'product', description: '' } });
  for (const packaging of variants) {
    const variant = await api(page, `products/${product.id}/variants/`, {
      method: 'POST',
      data: { packaging_name: packaging, base_quantity: '1', unit: 'piece', selling_price: price, low_stock_threshold: threshold || null },
    });
    if (stock > 0) {
      await api(page, 'stock/in/', { method: 'POST', data: { variant: variant.id, quantity: String(stock), reason: 'Audit e2e' } });
    }
  }
  return product;
}

/** Retire de la liste des actifs les articles créés par un audit (pas de suppression d'article). */
export async function deactivate(page, ids) {
  for (const id of ids) await api(page, `products/${id}/deactivate/`, { method: 'POST' });
}
