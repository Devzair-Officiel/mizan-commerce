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

/**
 * Article avec ses formats et un stock initial facultatif : le premier format est créé avec
 * l'article (un seul appel, tout ou rien), les suivants par l'API des formats.
 */
export async function createArticle(page, { name, price, threshold = '', stock = 0, variants = ['Par défaut'] }) {
  const format = (packaging) => ({
    packaging_name: packaging, base_quantity: '1', unit: 'piece', selling_price: price, low_stock_threshold: threshold || null,
  });
  const [first, ...others] = variants;
  const product = await api(page, 'products/', {
    method: 'POST',
    data: { name, type: 'product', description: '', variant: format(first), ...(stock > 0 ? { initial_stock: String(stock) } : {}) },
  });
  for (const packaging of others) {
    const variant = await api(page, `products/${product.id}/variants/`, { method: 'POST', data: format(packaging) });
    if (stock > 0) {
      await api(page, 'stock/entries/', { method: 'POST', data: { lines: [{ variant: variant.id, quantity: String(stock) }] } });
    }
  }
  return product;
}

/** Supprime les articles créés par un audit (seulement s'ils n'ont jamais servi). */
export async function remove(page, ids) {
  for (const id of ids) await api(page, `products/${id}/`, { method: 'DELETE' });
}

/** Retire de la liste des actifs les articles créés par un audit (pas de suppression d'article). */
export async function deactivate(page, ids) {
  for (const id of ids) await api(page, `products/${id}/deactivate/`, { method: 'POST' });
}
