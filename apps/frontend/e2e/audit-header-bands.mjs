/**
 * Audit des bandes d'en-tête (design_principles §4 et §11), à 1440px et 360px, en clair et en sombre, en
 * français et en arabe, sur l'accueil, les fiches client, commande et article, et les formulaires article
 * (création) et client (création, modification) :
 * - chaque titre de carte est dans une bande au fond `muted`, séparée du contenu par une bordure (sauf
 *   l'en-tête d'une carte repliée, sur mobile : la carte se réduit à sa bande) ;
 * - chaque en-tête de tableau a le même fond ; une carte titrée qui contient un tableau garde ses deux
 *   bandes, la bordure entre elles ;
 * - tout texte d'une bande (liens « Tout voir », compteurs, badges, montants) atteint 4,5:1 sur son fond
 *   réel, mesuré sur les couleurs rendues.
 * Chaque passage teste le thème par défaut et les palettes les moins contrastées (calcul sur tous les
 * thèmes, couleurs écrêtées au gamut sRGB comme le navigateur : rouge sur fond Crème en sombre, cyan sur
 * Crème, rouge sur Lilas et rose sur Défaut en clair…).
 * Données : un client « Audit En-têtes » avec une commande impayée, un article à deux formats.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { api, allResults, createArticle, deactivate } from './lib/products.mjs';

const report = createReport();
const CUSTOMER = 'Audit En-têtes';
const PALETTES = {
  light: [['sage', 'cream'], ['cyan', 'cream'], ['red', 'lilac'], ['rose', 'default']],
  dark: [['sage', 'cream'], ['red', 'cream'], ['charcoal', 'cream']],
};

/** Bandes de la page (titres de carte et en-têtes de tableau) et leurs défauts. Exécuté dans la page. */
function bandIssues() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  /** Couleurs CSS superposées (la première opaque), lues en sRGB 0-255. */
  const paint = (colors) => {
    g.clearRect(0, 0, 1, 1);
    for (const c of colors) {
      g.fillStyle = c;
      g.fillRect(0, 0, 1, 1);
    }
    return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const lum = (rgb) => {
    const [r, gr, b] = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const filled = (el) => { const c = getComputedStyle(el).backgroundColor; return c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)'; };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; };
  const probe = document.createElement('div');
  probe.style.background = 'var(--muted)';
  document.body.append(probe);
  const muted = paint([getComputedStyle(probe).backgroundColor]);
  probe.remove();
  const isMuted = (el) => paint([getComputedStyle(el).backgroundColor]).every((v, i) => Math.abs(v - muted[i]) <= 2);
  const name = (el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const issues = [];

  const titles = [...document.querySelectorAll('main h2')].filter((h) => visible(h) && !h.closest('[role=dialog]'));
  const bands = [];
  for (const h of titles) {
    let band = h;
    while (band && band !== document.body && !filled(band)) band = band.parentElement;
    if (!band || band === document.body || !isMuted(band)) { issues.push(`titre « ${name(h)} » hors bande muted`); continue; }
    const folded = band.querySelector('[aria-expanded="false"]');
    if (!folded && parseFloat(getComputedStyle(band).borderBottomWidth) < 1) issues.push(`bande « ${name(h)} » sans bordure en bas`);
    bands.push(band);
  }
  const heads = [...document.querySelectorAll('main thead')].filter(visible);
  for (const head of heads) {
    if (!isMuted(head)) issues.push(`en-tête de tableau « ${name(head)} » hors fond muted`);
    const band = bands.find((b) => b.parentElement?.contains(head));
    if (band && Math.abs(band.getBoundingClientRect().bottom - head.getBoundingClientRect().top) > 1) {
      issues.push(`tableau de « ${name(band)} » : bande de titre et en-tête de colonnes non accolées`);
    }
  }

  for (const band of [...bands, ...heads]) {
    const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!node.textContent.trim() || !visible(el)) continue;
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        if (filled(n)) layers.unshift(getComputedStyle(n).backgroundColor);
        if (n === band) break;
      }
      const bg = paint(layers);
      const fg = paint([`rgb(${bg.join(',')})`, getComputedStyle(el).color]);
      const k = contrast(fg, bg);
      if (k < 4.5) issues.push(`« ${node.textContent.trim().slice(0, 30)} » à ${k.toFixed(2)}:1`);
    }
  }
  return { bands: bands.length, heads: heads.length, issues: [...new Set(issues)] };
}

async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER } });
  const order = await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: 'Audit en-têtes', quantity: 1, unit_price: '9.00' }] },
  });
  const product = await createArticle(page, { name: `Audit en-têtes ${String(Date.now()).slice(-6)}`, price: '9.00', stock: 2, variants: ['Petit', 'Grand'] });
  return { customer, order, product };
}

/** Pages vérifiées et nombre minimal de bandes / d'en-têtes de tableau attendus. */
function screens({ customer, order, product }, mobile) {
  return [
    ['accueil', '/dashboard', 2, 0],
    ['fiche client', `/customers/${customer.id}`, 3, mobile ? 0 : 1],
    ['fiche commande', `/orders/${order.id}`, 4, 0],
    ['fiche article', `/products/${product.id}`, 4, mobile ? 0 : 1],
    ['nouvel article', '/products/new', 6, 0],
    ['nouveau client', '/customers/new', 4, 0],
    ['modification client', `/customers/${customer.id}/edit`, 4, 0],
  ];
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme, setPalette } = await openSession(browser, viewport);
  const data = await setup(page);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      for (const [primary, background] of PALETTES[theme]) {
        setPalette({ primary_color: primary, background_theme: background });
        for (const [name, path, minBands, minHeads] of screens(data, viewport.mobile)) {
          try {
            await page.goto(`${BASE}${path}`);
            await page.waitForLoadState('networkidle');
            await page.locator('main h2').first().waitFor({ state: 'visible', timeout: 8000 });
            const { bands, heads, issues } = await page.evaluate(bandIssues);
            const count = bands >= minBands && heads >= minHeads ? [] : [`${bands} bandes, ${heads} en-têtes de tableau`];
            const all = [...count, ...issues];
            report.check(all.length === 0, `${label} ${primary}/${background} : ${name}, bandes muted et contrastes ≥ 4,5:1${all.map((p) => `\n      ${p}`).join('')}`);
          } catch (error) {
            report.check(false, `${label} ${primary}/${background} : ${name} interrompu — ${error.message.split('\n')[0]}`);
          }
        }
      }
      setPalette({});
      const problems = watch.problems.slice(before);
      report.check(problems.length === 0, `${label} : console propre, défilement jamais bloqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await api(page, `orders/${data.order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
  await deactivate(page, [data.product.id]);
  await ctx.close();
}
await browser.close();
report.finish();
