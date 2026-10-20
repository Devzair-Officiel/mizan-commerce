/**
 * Audit de la fiche article (C4, gabarit de détail), à 1440px et 360px, en français et en arabe,
 * en clair et en sombre :
 * - article à un format : nom, badge « Stock faible », carte Stock, derniers mouvements et « Voir tout » ;
 *   entrée rapide par l'action principale ; ajout d'un format en fenêtre, puis « + Entrée » sur sa ligne ;
 * - menu « ⋯ » des formats : format qui a servi sans « Supprimer » ; format jamais utilisé supprimé
 *   après confirmation ; dernier format actif ni retirable ni supprimable ; format devenu utilisé
 *   pendant la confirmation → la fenêtre affiche le refus (409) ;
 * - article jamais utilisé (avec son stock initial) : « Supprimer » dans le menu « ⋯ », confirmation, retour à la liste ;
 * - article vendu : pas de « Supprimer » dans le menu, l'API refuse (409) ;
 * - service : carte Prix et ventes, ni formats, ni stock, ni entrée de stock ;
 * - console propre, aucun élément imbriqué.
 * Nettoyage : commande annulée, articles utilisés désactivés, service supprimé.
 * `SHOTS=<dossier>` capture un parcours interrompu.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, createArticle, deactivate, remove } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const visible = (locator) => locator.filter({ visible: true });
const button = (scope, name) => visible(scope.getByRole('button', { name, exact: true }));

async function goto(page, path, nested) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

async function toastShown(page, text) {
  const toast = page.locator('[data-sonner-toast]').filter(text ? { hasText: text } : {}).first();
  return toast.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
}

/** Ouvre le menu « ⋯ » (menu ancré sur desktop, fenêtre du bas sur mobile) et renvoie ses entrées. */
async function openMenu(page, ctx) {
  await button(page, msg(ctx.locale, 'ui.detail.more_actions')).first().click();
  const items = ctx.viewport.mobile ? page.getByRole('dialog').getByRole('button') : page.getByRole('menuitem');
  await items.first().waitFor();
  return items;
}

async function createService(page, name) {
  return api(page, 'products/', {
    method: 'POST',
    data: { name, type: 'service', description: 'Audit', variant: { packaging_name: 'Par défaut', base_quantity: '1', unit: 'piece', selling_price: '30.00' } },
  });
}

/** Article à un format : en-tête, badge, cartes, entrée rapide par l'action principale. */
async function checkArticle(page, ctx, article, nested) {
  const { label, locale } = ctx;
  const s = (key, values) => fmt(locale, `articles.sheet.${key}`, values);
  await goto(page, `/products/${article.id}`, nested);
  const title = await visible(page.locator('h1')).first().innerText();
  const badge = await visible(page.getByText(msg(locale, 'articles.badges.low_stock'), { exact: true })).count();
  const hint = await visible(page.getByText(s('stock_total_hint', { count: 1 }), { exact: true })).count();
  const seeAll = visible(page.getByRole('link', { name: s('see_all'), exact: true }));
  report.check(title.includes(article.name) && badge > 0 && hint === 1
    && (await seeAll.getAttribute('href')) === `/stock?tab=mouvements&product=${article.id}`,
  `${label} : fiche — nom, badge « ${msg(locale, 'articles.badges.low_stock')} », carte Stock, « ${s('see_all')} » vers les mouvements de l'article`);

  await button(page, s('stock_in')).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: msg(locale, 'stock.quick.quantity') }).fill('3');
  nested.push(...await nestedInteractive(page));
  await dialog.locator('button[type=submit]').click();
  const toast = await toastShown(page);
  await dialog.waitFor({ state: 'detached' });
  const saved = await api(page, `products/${article.id}/`);
  report.check(toast && Number(saved.variants[0].stock_quantity) === 5,
    `${label} : « ${s('stock_in')} » ouvre l'entrée rapide du format unique, stock 2 → 5, notification`);
}

/** « Ajouter un format » en fenêtre, puis « + Entrée » sur la ligne du nouveau format. */
async function checkNewFormat(page, ctx, article, nested) {
  const { label, locale } = ctx;
  const s = (key, values) => fmt(locale, `articles.sheet.${key}`, values);
  await button(page, s('add_format')).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: s('format.name', { type: 'product' }), exact: true }).fill('Lot');
  await dialog.getByRole('textbox', { name: msg(locale, 'articles.form.selling_price'), exact: true }).fill('18');
  nested.push(...await nestedInteractive(page));
  await dialog.locator('button[type=submit]').click();
  const toast = await toastShown(page, s('format.created'));
  await dialog.waitFor({ state: 'detached' });
  const saved = await api(page, `products/${article.id}/`);
  const entryFor = fmt(locale, 'stock.levels.entry_for', { name: fmt(locale, 'stock.common.variant_label', { product: article.name, format: 'Lot' }) });
  await button(page, entryFor).first().click();
  const opened = await page.getByRole('dialog').waitFor().then(() => true, () => false);
  nested.push(...await nestedInteractive(page));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  report.check(toast && saved.variants.length === 2 && opened,
    `${label} : « ${s('add_format')} » → format « Lot » enregistré, « + Entrée » sur sa ligne ouvre l'entrée rapide`);
}

/** Ouvre le menu « ⋯ » du format `format` de l'article et renvoie le texte de ses entrées. */
async function openFormatMenu(page, ctx, article, format) {
  // Le format par défaut est désigné par le seul nom de l'article (comme dans le stock).
  const name = format === 'Par défaut' ? article.name : fmt(ctx.locale, 'stock.common.variant_label', { product: article.name, format });
  await button(page, fmt(ctx.locale, 'articles.sheet.format.actions_label', { name })).click();
  const items = ctx.viewport.mobile ? page.getByRole('dialog').getByRole('button') : page.getByRole('menuitem');
  await items.first().waitFor();
  return { items, texts: await items.allInnerTexts() };
}

async function closeMenu(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('menu').or(page.getByRole('dialog')).first().waitFor({ state: 'detached' }).catch(() => {});
}

/** Confirme la suppression du format `format` depuis son menu ; `before` s'exécute fenêtre ouverte. */
async function deleteFormat(page, ctx, article, format, before = async () => {}) {
  const f = (key, values) => fmt(ctx.locale, `articles.sheet.format.${key}`, values);
  const { items } = await openFormatMenu(page, ctx, article, format);
  await items.filter({ hasText: f('delete') }).click();
  // Le format par défaut est désigné par le seul nom de l'article (comme dans le stock).
  const name = format === 'Par défaut' ? article.name : fmt(ctx.locale, 'stock.common.variant_label', { product: article.name, format });
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: f('confirm_delete_title', { name }) });
  await confirm.waitFor();
  await before();
  await confirm.getByRole('button', { name: f('delete'), exact: true }).click();
  return confirm;
}

/**
 * Menu « ⋯ » des formats (« Par défaut » a servi : entrée de stock ; « Lot » jamais utilisé) :
 * suppression de « Lot », puis dernier format actif ; enfin un format qui sert pendant la confirmation (409).
 */
async function checkFormatMenu(page, ctx, article, fixtures) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.sheet.format.${key}`, values);
  const used = await openFormatMenu(page, ctx, article, 'Par défaut');
  await closeMenu(page);
  const lot = await openFormatMenu(page, ctx, article, 'Lot');
  await closeMenu(page);
  report.check(used.texts.some((x) => x.includes(f('edit'))) && used.texts.some((x) => x.includes(f('deactivate')))
    && !used.texts.some((x) => x.includes(f('delete'))) && lot.texts.some((x) => x.includes(f('delete'))),
  `${label} : menu « ⋯ » des formats — « ${f('edit')} », « ${f('deactivate')} » ; « ${f('delete')} » seulement sur le format jamais utilisé`);

  const confirm = await deleteFormat(page, ctx, article, 'Lot');
  const toast = await toastShown(page, f('deleted'));
  await confirm.waitFor({ state: 'detached' });
  const after = await api(page, `products/${article.id}/`);
  const last = await openFormatMenu(page, ctx, article, 'Par défaut');
  await closeMenu(page);
  report.check(toast && after.variants.length === 1 && last.texts.some((x) => x.includes(f('edit')))
    && !last.texts.some((x) => x.includes(f('deactivate')) || x.includes(f('delete'))),
    `${label} : « Lot » supprimé après confirmation (« ${f('deleted')} ») ; dernier format actif : « ${f('edit')} » seulement`);

  const extra = await api(page, `products/${article.id}/variants/`, {
    method: 'POST', data: { packaging_name: 'Lot 2', base_quantity: '2', unit: 'piece', selling_price: '20.00', initial_stock: '2' },
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  // Le format sert (commande) pendant que la confirmation est ouverte : le serveur refuse (409).
  const refused = await deleteFormat(page, ctx, article, 'Lot 2', async () => {
    const order = await api(page, 'orders/', { method: 'POST', data: { items: [{ variant: extra.id, quantity: 1 }] } });
    fixtures.orders.push(order.id);
  });
  const shown = await refused.getByText(f('delete_refused'), { exact: true }).waitFor().then(() => true, () => false);
  await page.keyboard.press('Escape');
  await refused.waitFor({ state: 'detached' });
  const kept = await api(page, `products/${article.id}/`);
  report.check(shown && kept.variants.length === 2,
    `${label} : format vendu pendant la confirmation → « ${f('delete_refused')} » dans la fenêtre, format conservé`);
}

/** Article jamais utilisé, avec son stock initial : « Supprimer », confirmation, retour à la liste, article supprimé. */
async function checkDelete(page, ctx, fresh, nested) {
  const { label, locale } = ctx;
  const s = (key, values) => fmt(locale, `articles.sheet.${key}`, values);
  await goto(page, `/products/${fresh.id}`, nested);
  const items = await openMenu(page, ctx);
  await items.filter({ hasText: s('delete') }).click();
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: s('confirm_delete_title', { type: 'product' }) });
  await confirm.waitFor();
  await confirm.getByRole('button', { name: s('delete'), exact: true }).click();
  await page.waitForURL((u) => u.pathname === '/products');
  const toast = await toastShown(page, s('deleted', { type: 'product' }));
  const res = await page.request.fetch(`${BASE}/api/proxy/products/${fresh.id}/`);
  report.check(toast && res.status() === 404,
    `${label} : article jamais utilisé — « ${s('delete')} » dans le menu, confirmation, retour à la liste, supprimé`);
}

/** Article vendu : pas de « Supprimer » dans le menu ; l'API refuse la suppression. */
async function checkSold(page, ctx, sold, nested) {
  const { label, locale } = ctx;
  const s = (key, values) => fmt(locale, `articles.sheet.${key}`, values);
  await goto(page, `/products/${sold.id}`, nested);
  const items = await openMenu(page, ctx);
  const texts = await items.allInnerTexts();
  nested.push(...await nestedInteractive(page));
  await page.keyboard.press('Escape');
  const refused = await page.request.fetch(`${BASE}/api/proxy/products/${sold.id}/`, { method: 'DELETE' });
  report.check(texts.some((x) => x.includes(s('deactivate'))) && !texts.some((x) => x.includes(s('delete'))) && refused.status() === 409,
    `${label} : article vendu — menu sans « ${s('delete')} », suppression refusée par l'API (${refused.status()})`);
}

/** Service : Prix et ventes, ni formats, ni stock, ni entrée de stock. */
async function checkService(page, ctx, service, nested) {
  const { label, locale } = ctx;
  const s = (key, values) => fmt(locale, `articles.sheet.${key}`, values);
  await goto(page, `/products/${service.id}`, nested);
  const has = async (text) => visible(page.getByRole('heading', { level: 2, name: text, exact: true })).count();
  report.check(await has(s('prices_title')) === 1 && await has(s('sales_title')) === 1
    && await has(s('formats_title')) === 0 && await has(s('stock_title')) === 0 && await button(page, s('stock_in')).count() === 0,
  `${label} : service — cartes « ${s('prices_title')} » et « ${s('sales_title')} », ni formats, ni stock, ni « ${s('stock_in')} »`);
}

async function run(page, ctx, fixtures, nested) {
  const stamp = `${String(Date.now()).slice(-6)} ${ctx.viewport.name} ${ctx.locale}`;
  const article = await createArticle(page, { name: `Audit fiche ${stamp}`, price: '12.00', threshold: '5', stock: 2 });
  fixtures.used.push(article.id);
  // Stock initial saisi à la création : l'article n'a pas servi pour autant.
  const fresh = await createArticle(page, { name: `Audit fiche jamais utilisé ${stamp}`, price: '3.00', stock: 4 });
  try {
    await checkArticle(page, ctx, article, nested);
    await checkNewFormat(page, ctx, article, nested);
    await checkFormatMenu(page, ctx, article, fixtures);
    await checkDelete(page, ctx, fresh, nested);
    await checkSold(page, ctx, fixtures.sold, nested);
    await checkService(page, ctx, fixtures.service, nested);
  } catch (error) {
    report.check(false, `${ctx.label} : parcours interrompu — ${error.message.split('\n').slice(0, process.env.DEBUG ? 6 : 1).join(' / ')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/fiche-${ctx.viewport.name}-${ctx.locale}.png`, fullPage: true });
    await remove(page, [fresh.id]).catch(() => {});
  }
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const stamp = `${String(Date.now()).slice(-6)} ${viewport.name}`;
    const sold = await createArticle(page, { name: `Audit fiche vendu ${stamp}`, price: '9.00', stock: 3 });
    const order = await api(page, 'orders/', { method: 'POST', data: { items: [{ variant: sold.variants[0].id, quantity: 1 }] } });
    const service = await createService(page, `Audit fiche service ${stamp}`);
    const fixtures = { sold, service, used: [sold.id], orders: [order.id] };
    for (const locale of ['fr', 'ar']) {
      for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
        console.log(`\n=== ${label}`);
        await setLocale(locale);
        setTheme(theme);
        watch.setLabel(label);
        const nested = [];
        await run(page, { label, viewport, locale }, fixtures, nested);
        // Le 409 du format vendu pendant la confirmation est provoqué par l'audit (refus attendu).
        const provoked = (p) => /status of 409 .*\/api\/proxy\/products\/[0-9a-f-]{36}\/variants\/[0-9a-f-]{36}\/?\)/.test(p);
        const problems = [...watch.problems.filter((p) => !provoked(p)), ...nested.map((n) => `imbriqué : ${n}`)];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
        watch.problems.length = 0;
      }
    }
    for (const id of fixtures.orders) await api(page, `orders/${id}/status/`, { method: 'POST', data: { status: 'cancelled' } }).catch(() => {});
    await deactivate(page, fixtures.used);
    await remove(page, [service.id]);
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
