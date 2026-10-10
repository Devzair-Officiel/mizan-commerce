/**
 * Audit des écrans principaux : console surveillée et éléments interactifs
 * imbriqués, à 1440px et 360px. ONLY=clients,articles limite aux écrans nommés.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { nestedInteractive } from './lib/watch.mjs';

/** Premier identifiant d'une liste de l'API (via le proxy, avec la session). */
async function firstId(page, path) {
  const res = await page.request.get(`${BASE}/api/proxy/${path}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : data.results)?.[0]?.id;
}

function screens({ order, customer, product }) {
  return [
    ['accueil', '/dashboard'], ['commandes', '/orders'], ['détail commande', `/orders/${order}`],
    ['nouvelle commande', '/orders/new'], ['modification commande', `/orders/${order}/edit`],
    ['clients', '/customers'], ['fiche client', `/customers/${customer}`],
    ['nouveau client', '/customers/new'], ['modification client', `/customers/${customer}/edit`],
    ['articles', '/products'], ['fiche article', `/products/${product}`],
    ['nouvel article', '/products/new'], ['stock', '/stock'], ['entrée stock', '/stock/add'],
    ['sortie stock', '/stock/out'], ['rappels', '/reminders'], ['notes', '/notes'],
    ['factures', '/invoices'], ['zakat', '/zakat'], ['plus', '/more'], ['profil', '/profile'],
    ['paramètres', '/settings'], ['équipe', '/settings/team'],
    ['page publique', '/settings/public-page'], ['abonnement', '/settings/subscription'],
  ];
}

const only = process.env.ONLY?.split(',');
const report = createReport();
const browser = await launch();
for (const viewport of VIEWPORTS) {
  console.log(`\n=== ${viewport.name}px`);
  const { ctx, page, watch } = await openSession(browser, viewport);
  const ids = {
    order: await firstId(page, 'orders/'),
    customer: await firstId(page, 'customers/'),
    product: await firstId(page, 'products/'),
  };
  for (const [name, path] of screens(ids).filter(([n]) => !only || only.includes(n))) {
    watch.setLabel(`${viewport.name} ${name}`);
    const before = watch.problems.length;
    await page.goto(BASE + path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const nested = await nestedInteractive(page);
    const problems = [...watch.problems.slice(before), ...nested.map((n) => `imbriqué : ${n}`)];
    report.check(problems.length === 0, `${name} (${path})${problems.map((p) => `\n      ${p}`).join('')}`);
  }
  await ctx.close();
}
await browser.close();
report.finish();
