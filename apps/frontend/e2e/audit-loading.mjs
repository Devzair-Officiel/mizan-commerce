/**
 * Audit du chargement en connexion lente : fiche article, fiche client et détail d'une commande,
 * à 1440px et 360px, en français et en arabe.
 * Le réseau du navigateur est limité (CDP : latence 1,5 s, 2 Mo/s) pendant le chargement de la page :
 * - un squelette à la forme de la page (au moins trois cartes) est visible avant les données ;
 * - aucun texte de chargement seul (« Chargement… ») n'apparaît, du premier rendu à la fin ;
 * - la page finit par afficher l'objet, sans squelette ;
 * - console propre.
 * Chaque page est d'abord ouverte sans limitation (compilation du serveur de dev).
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { api } from './lib/products.mjs';
import { domChange } from './lib/wait.mjs';

const report = createReport();
// Anciens textes de chargement seuls (clés retirées des messages) : ils ne doivent plus apparaître.
const LOADING = ['Chargement…', 'Loading…', 'جارٍ التحميل…'];
const SLOW = { offline: false, latency: 1500, downloadThroughput: 2 * 1024 * 1024, uploadThroughput: 512 * 1024 };
const FAST = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

async function first(page, path) {
  const data = await api(page, path);
  if (!data.results.length) throw new Error(`Aucune donnée pour ${path} dans la boutique d'audit`);
  return data.results[0];
}

/** État courant : squelette visible (et son nombre de cartes), texte de chargement seul, objet affiché. */
function sample(page, name, loading) {
  return page.evaluate(({ name, loading }) => {
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const regions = [...document.querySelectorAll('[data-skeleton]')].filter(shown);
    const cards = Math.max(0, ...regions.map((r) => [...r.querySelectorAll('.rounded-2xl')].filter(shown).length));
    // innerText applique le `text-transform` (titre en `capitalize` : « En-Têtes ») : comparaison sans casse.
    const lines = (document.body?.innerText ?? '').split('\n').map((l) => l.trim());
    const wanted = name.toLowerCase();
    return {
      skeleton: regions.length > 0, cards,
      loadingText: lines.find((l) => loading.includes(l)) ?? null,
      loaded: regions.length === 0 && lines.some((l) => l.toLowerCase().includes(wanted)),
    };
  }, { name, loading }).catch(() => ({ skeleton: false, cards: 0, loadingText: null, loaded: false }));
}

/** Ouvre `path` en connexion lente et suit l'affichage jusqu'à l'objet chargé. */
async function checkSlow(page, cdp, label, { title, path, name }) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await cdp.send('Network.emulateNetworkConditions', SLOW);
  let cards = 0;
  let loadingText = null;
  let loaded = false;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'commit' });
    const deadline = Date.now() + 90_000;
    while (!loaded && Date.now() < deadline) {
      const s = await sample(page, name, LOADING);
      if (s.skeleton) cards = Math.max(cards, s.cards);
      loadingText ??= s.loadingText;
      loaded = s.loaded;
      if (!loaded) await domChange(page);
    }
  } finally {
    await cdp.send('Network.emulateNetworkConditions', FAST);
  }
  report.check(cards >= 3, `${label} : ${title} — squelette à la forme de la page visible (${cards} cartes)`);
  report.check(loadingText === null, `${label} : ${title} — aucun texte de chargement seul${loadingText ? ` (« ${loadingText} »)` : ''}`);
  report.check(loaded, `${label} : ${title} — « ${name} » affiché, squelette retiré`);
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale } = await openSession(browser, viewport);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    const product = await first(page, 'products/?type=product');
    const customer = await first(page, 'customers/');
    const order = await first(page, 'orders/');
    const targets = [
      { title: 'fiche article', path: `/products/${product.id}`, name: product.name },
      { title: 'fiche client', path: `/customers/${customer.id}`, name: customer.name },
      { title: 'détail commande', path: `/orders/${order.id}`, name: order.order_number },
    ];
    for (const locale of ['fr', 'ar']) {
      if (!inMatrix(viewport, locale)) continue;
      const label = `${viewport.name}px ${locale}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      watch.setLabel(label);
      for (const target of targets) await checkSlow(page, cdp, label, target);
      report.check(watch.problems.length === 0, `${label} : console propre${watch.problems.map((p) => `\n      ${p}`).join('')}`);
      watch.problems.length = 0;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
