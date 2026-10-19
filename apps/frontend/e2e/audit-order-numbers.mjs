/**
 * Audit des numéros de commande et de facture en arabe, à 1440px et 360px : sur chaque page qui en
 * affiche (accueil, commandes, fiche et modification d'une commande, fiche client, rappels,
 * factures, mouvements de stock, fiche article, recherche), chaque numéro visible (« 2026-042 »,
 * « fact-141026-0007 ») est isolé du sens du texte (<bdi dir="ltr"> ou caractères d'isolement) et
 * se lit de gauche à droite : son premier caractère est affiché à gauche du dernier.
 * Message WhatsApp préparé : le numéro y est isolé (U+2066 … U+2069).
 * Client dédié « Audit Numéros » : sa commande et sa facture sont gardées d'un passage à l'autre,
 * son rappel est supprimé à la fin.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const LOCALE = 'ar';
const CUSTOMER = 'Audit Numéros';
const PHONE = '+33612340042';
const TITLE = 'Audit numéros';
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const t = (key) => msg(LOCALE, key);

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Client, commande facturée et rappel lié. */
async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER, phone: PHONE } });
  const existing = (await api(page, `orders/?customer=${customer.id}`)).results[0];
  // Un article du catalogue : sa sortie de stock donne le mouvement lié à une commande (mouvements, fiche article).
  const stocked = (await api(page, 'products/')).results.find((p) => p.type === 'product');
  const variant = (await api(page, `products/${stocked.id}/`)).variants[0].id;
  const created = existing ?? await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: TITLE, quantity: 1, unit_price: '9.00' }, { variant, quantity: 1 }] },
  });
  let order = await api(page, `orders/${created.id}/`);
  if (!order.invoice) {
    await api(page, 'invoices/', { method: 'POST', data: { order_id: order.id } });
    order = await api(page, `orders/${order.id}/`);
  }
  await api(page, 'reminders/', {
    method: 'POST',
    data: { title: TITLE, category: 'free', customer: customer.id, order: order.id, due_at: new Date(Date.now() - 3_600_000).toISOString() },
  });
  return { customer, order };
}

async function cleanup(page) {
  for (const scope of ['todo', 'upcoming', 'done']) {
    for (const r of await allResults(page, `reminders/?scope=${scope}`)) {
      if (r.title.startsWith(TITLE)) await api(page, `reminders/${r.id}/`, { method: 'DELETE' });
    }
  }
}

/**
 * Numéros visibles de la page (ou de `selector`) : isolés (dans un <bdi dir="ltr">, ou entourés
 * de U+2066 … U+2069 dans un texte brut) et affichés de gauche à droite.
 */
function scan(page, selector = 'body') {
  return page.evaluate((sel) => {
    const re = /fact-\d{6}-\d{4}|\b\d{4}-\d{3,}\b/g;
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || el.closest('script, style') || !el.checkVisibility()) continue;
        for (const m of node.data.matchAll(re)) {
          const start = m.index;
          const end = start + m[0].length;
          const box = (i) => {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            return range.getBoundingClientRect();
          };
          const first = box(start);
          const last = box(end - 1);
          if (!first.width || !last.width) continue;
          out.push({
            text: m[0],
            isolated: Boolean(el.closest('bdi[dir="ltr"]')) || (node.data[start - 1] === '⁦' && node.data[end] === '⁩'),
            ltr: first.left < last.left,
          });
        }
      }
    }
    return out;
  }, selector);
}

/** Tous les numéros de la page isolés et lus de gauche à droite ; `expected` doit y figurer. */
async function checkNumbers(page, label, where, expected, selector) {
  const found = await scan(page, selector);
  const wrong = found.filter((n) => !n.isolated || !n.ltr);
  report.check(found.some((n) => n.text === expected) && wrong.length === 0,
    `${label} : ${where}, ${found.length} numéro(s), tous isolés et lus de gauche à droite (« ${expected} »)${
      wrong.map((n) => `\n      ${n.text} : ${n.isolated ? '' : 'non isolé '}${n.ltr ? '' : 'inversé'}`).join('')}`);
}

async function checkPages(page, label, { customer, order }) {
  const pages = [
    ['accueil', '/dashboard', order.order_number],
    ['liste des commandes', '/orders', order.order_number],
    ['fiche commande', `/orders/${order.id}`, order.invoice.number],
    ['modification de la commande', `/orders/${order.id}/edit`, order.order_number],
    ['fiche client', `/customers/${customer.id}`, order.order_number],
    ['rappels', '/reminders', order.order_number],
    ['liste des factures', '/invoices', order.invoice.number],
    ['facture', `/invoices/${order.invoice.id}`, order.invoice.number],
  ];
  for (const [where, path, expected] of pages) {
    await goto(page, path);
    await shown(page.getByText(expected).filter({ visible: true }));
    await checkNumbers(page, label, where, expected);
  }
  await goto(page, `/orders/${order.id}`);
  await shown(page.getByText(order.invoice.number).filter({ visible: true }));
  await checkNumbers(page, label, 'fiche commande (titre)', order.order_number);

  // Mouvement lié à une commande, parmi les plus récents (première page de la liste), et son article.
  const movement = (await api(page, 'stock/movements/')).results.find((m) => m.order_number);
  for (const [where, path] of [['mouvements de stock', '/stock?tab=mouvements'], ['fiche article', `/products/${movement?.product_id}`]]) {
    await goto(page, path);
    await shown(page.getByText(movement?.order_number ?? '—').filter({ visible: true }));
    await checkNumbers(page, label, where, movement?.order_number ?? '(aucun mouvement de commande)');
  }
}

/** Recherche globale du numéro, depuis l'accueil. */
async function checkSearch(page, label, { order }) {
  await goto(page, '/dashboard');
  await visibleButton(page, t('layout.common.search')).click();
  await page.getByRole('combobox', { name: t('layout.search.aria_label') }).filter({ visible: true }).fill(order.order_number);
  await shown(page.getByRole('option').filter({ hasText: order.order_number }));
  await checkNumbers(page, label, 'recherche', order.order_number, '[role="listbox"]');
  await page.keyboard.press('Escape');
}

/** Message WhatsApp préparé depuis la fiche commande : numéro isolé dans le texte. */
async function checkWhatsApp(page, label, { order }) {
  await goto(page, `/orders/${order.id}`);
  await visibleButton(page, t('orders.customerCard.whatsapp')).first().click();
  const text = await page.getByRole('textbox', { name: t('messages.prepared.message_label') }).inputValue();
  report.check(text.includes(`⁦${order.order_number}⁩`), `${label} : message WhatsApp, numéro « ${order.order_number} » isolé`);
  await page.keyboard.press('Escape');
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    console.log(`\n=== ${viewport.name}px`);
    const { ctx, page, watch, setLocale } = await openSession(browser, viewport);
    await setLocale(LOCALE);
    const label = `${viewport.name}px ${LOCALE}`;
    watch.setLabel(label);
    await cleanup(page);
    try {
      const data = await setup(page);
      await checkPages(page, label, data);
      await checkSearch(page, label, data);
      await checkWhatsApp(page, label, data);
    } finally {
      await cleanup(page);
    }
    report.check(watch.problems.length === 0, `${label} : console et défilement propres${watch.problems.map((p) => `\n      ${p}`).join('')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.check(nested.length === 0, `aucun élément interactif imbriqué${[...new Set(nested)].map((n) => `\n      ${n}`).join('')}`);
report.finish();
