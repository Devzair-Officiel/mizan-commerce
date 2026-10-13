import { BASE } from './session.mjs';

/**
 * Image PNG de `width`×`height` dessinée dans le navigateur : deux bandes de couleur et un
 * cercle au centre, pour voir le recadrage. Sert aux photos très hautes ou très larges.
 */
export async function makeImage(page, width, height) {
  const base64 = await page.evaluate(([w, h]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f59e0b';
    if (w > h) ctx.fillRect(0, 0, w / 2, h); else ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  }, [width, height]);
  return { name: `audit-${width}x${height}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

/** Envoie une photo telle quelle (sans recadrage, comme une photo ancienne) par l'API. */
export async function uploadImage(page, productId, file) {
  const res = await page.request.fetch(`${BASE}/api/proxy/products/${productId}/images/`, { method: 'POST', multipart: { image: file } });
  if (!res.ok()) throw new Error(`POST images : ${res.status()} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * Photos visibles de `scope` : cadre carré, image qui le remplit en `object-fit: cover`, fond
 * `bg-muted` sous l'image ; `ratio` = largeur / hauteur de l'image d'origine. Attend leur chargement.
 */
export async function squarePhotos(scope) {
  const images = scope.locator('img').filter({ visible: true });
  await images.first().waitFor();
  await scope.page().waitForFunction((els) => els.every((img) => img.complete && img.naturalWidth > 0), await images.elementHandles(), { timeout: 10000 }).catch(() => {});
  return images.evaluateAll((els) => els.map((img) => {
    const parent = img.parentElement;
    const frame = parent.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    const near = (a, b) => Math.abs(a - b) <= 1;
    return {
      square: frame.width > 0 && near(frame.width, frame.height),
      // L'image remplit l'intérieur du cadre (bordure exclue).
      fills: near(box.width, parent.clientWidth) && near(box.height, parent.clientHeight),
      cover: getComputedStyle(img).objectFit === 'cover',
      muted: getComputedStyle(img.parentElement).backgroundColor !== 'rgba(0, 0, 0, 0)',
      ratio: img.naturalWidth / img.naturalHeight,
    };
  }));
}

/** Toutes les photos sont carrées, recadrées au centre sur un fond ; l'une très haute et l'autre très large à l'origine. */
export function tallAndWideSquare(photos) {
  return photos.length >= 2 && photos.every((p) => p.square && p.fills && p.cover && p.muted)
    && photos.some((p) => p.ratio < 0.5) && photos.some((p) => p.ratio > 2);
}
