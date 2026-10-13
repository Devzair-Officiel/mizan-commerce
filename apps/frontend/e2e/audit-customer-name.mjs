/**
 * Audit du nom complet des clients (`display_name`), à 1440px et 360px, en clair et en sombre,
 * en français et en arabe : un client créé par le formulaire avec « Karima » + « Bensouda Test »
 * s'affiche « Karima Bensouda Test » (initiales KT) dans la liste des clients, sa fiche, le
 * sélecteur et le ticket d'une nouvelle commande, la liste et le détail des commandes, la
 * recherche globale ; « Karima » et « Karima Bens » le trouvent.
 * Le nom est unique par boutique : au début et à la fin, le client d'un passage précédent est
 * renommé puis archivé, sa commande annulée. Tout se passe dans la boutique du compte d'audit.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { textbox, visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const FIRST = 'Karima';
const LAST = 'Bensouda Test';
const FULL = 'Karima Bensouda Test';
const INITIALS = 'KT';

const visibleText = (scope, text) => scope.getByText(text, { exact: true }).filter({ visible: true });
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);

/** Libère le nom : le client d'un passage précédent est renommé et archivé, ses commandes en cours annulées. */
async function retire(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(LAST)}`);
  for (const customer of found.filter((c) => c.name.toLowerCase() === LAST.toLowerCase())) {
    for (const order of await allResults(page, `orders/?customer=${customer.id}`)) {
      if (order.status === 'to_prepare') await api(page, `orders/${order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
    }
    await api(page, `customers/${customer.id}/`, { method: 'PATCH', data: { name: `${LAST} ${Date.now()}` } });
    await api(page, `customers/${customer.id}/`, { method: 'DELETE' });
  }
}

/** Création par le formulaire, puis une commande par l'API (article libre, sans stock). */
async function create(page, t) {
  await page.goto(`${BASE}/customers/new`);
  await page.waitForLoadState('networkidle');
  await textbox(page, t('customers.form.first_name')).fill(FIRST);
  await textbox(page, t('customers.form.name')).fill(LAST);
  await visibleButton(page, t('customers.form.submit_create')).click();
  await page.waitForURL(/\/customers\/[0-9a-f-]{36}$/);
  const customerId = page.url().split('/').pop();
  const order = await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customerId, items: [{ product_name: 'Audit nom complet', quantity: 1, unit_price: '12.00' }] },
  });
  return { customerId, orderId: order.id };
}

async function checkCustomers(page, label, customerId) {
  for (const query of [FIRST, 'Karima Bens']) {
    await page.goto(`${BASE}/customers?search=${encodeURIComponent(query)}`);
    const main = page.locator('main');
    const ok = await shown(visibleText(main, FULL)) && await shown(visibleText(main, INITIALS));
    report.check(ok, `${label} : liste des clients, « ${query} » → « ${FULL} » (${INITIALS})`);
  }
  await page.goto(`${BASE}/customers/${customerId}`);
  report.check(await shown(page.locator('h1').filter({ visible: true, hasText: FULL })), `${label} : fiche, titre « ${FULL} »`);
}

/** Nouvelle commande : le sélecteur trouve le client par son prénom ; le ticket affiche son nom complet. */
async function checkNewOrder(page, t, label) {
  await page.goto(`${BASE}/orders/new`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  await visibleButton(page, t('orders.new.associate_customer')).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByPlaceholder(t('orders.customerPicker.search_placeholder')).fill(FIRST);
  const item = sheet.getByRole('button').filter({ hasText: FULL });
  const listed = await shown(item) && (await item.first().innerText()).includes(INITIALS);
  report.check(listed, `${label} : sélecteur, « ${FIRST} » → « ${FULL} » (${INITIALS})`);
  if (!listed) return;
  await item.first().click();
  report.check(await shown(visibleText(page.locator('main'), FULL)), `${label} : nouvelle commande, client « ${FULL} »`);
}

async function checkOrders(page, label, orderId) {
  await page.goto(`${BASE}/orders?search=${encodeURIComponent(FIRST)}`);
  report.check(await shown(visibleText(page.locator('main'), FULL)), `${label} : liste des commandes, « ${FIRST} » → « ${FULL} »`);
  await page.goto(`${BASE}/orders/${orderId}`);
  const main = page.locator('main');
  report.check(await shown(visibleText(main, FULL)) && await shown(visibleText(main, INITIALS)),
    `${label} : détail de la commande, « ${FULL} » (${INITIALS})`);
}

/** Recherche globale (depuis l'accueil) : le client et sa commande, par le prénom et par prénom + début du nom. */
async function checkGlobalSearch(page, t, label) {
  for (const query of [FIRST, 'Karima Bens']) {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle');
    await visibleButton(page, t('layout.common.search')).click();
    await page.getByRole('combobox', { name: t('layout.search.aria_label') }).filter({ visible: true }).fill(query);
    const options = page.getByRole('option').filter({ hasText: FULL });
    const found = await shown(options) && (await options.count()) >= 2;
    report.check(found, `${label} : recherche globale « ${query} » → client et commande « ${FULL} »`);
    await page.keyboard.press('Escape');
  }
}

const browser = await launch();
let customer = null;
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  // Quitter une nouvelle commande commencée demande confirmation.
  page.on('dialog', (dialog) => dialog.accept());
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const t = (key) => msg(locale, key);
      try {
        if (!customer) {
          await retire(page);
          customer = await create(page, t);
        }
        await checkCustomers(page, label, customer.customerId);
        await checkNewOrder(page, t, label);
        await checkOrders(page, label, customer.orderId);
        await checkGlobalSearch(page, t, label);
      } catch (error) {
        report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
      }
      const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  if (viewport === VIEWPORTS.at(-1)) await retire(page);
  await ctx.close();
}
await browser.close();
report.finish();
