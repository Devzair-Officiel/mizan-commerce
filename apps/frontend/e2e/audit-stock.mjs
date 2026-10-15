/**
 * Audit du stock (C4), à 1440px et 360px :
 * - parcours complet en français et en clair, une fois par taille : une vente fait passer un format
 *   en négatif (avertissement dans la nouvelle commande, filtre et indicateur « Négatif »), l'entrée
 *   rapide le régularise ; entrée de 3 articles à la main ; facture en PDF avec une ligne associée à la
 *   main, un article créé depuis sa ligne et des frais de port ignorés, puis facture suivante du même
 *   fournisseur (photo) associée et ignorée toute seule, ligne rétablie ; sortie pour casse refusée au-delà du
 *   stock ; correction d'inventaire ; suppression d'un article jamais utilisé, refus pour un article vendu ;
 * - écrans du stock en français et en arabe, clair et sombre : console propre, aucun élément imbriqué ;
 * - boutique de services : ni page ni entrée Stock.
 * La facture passe par la vraie chaîne (texte du PDF ou PaddleOCR, puis structuration) : environ 10 s par lecture.
 * Nettoyage : commande annulée, articles du parcours désactivés (ils ont servi : la suppression les refuse).
 * `DEBUG=1` affiche les notifications attendues et affichées ; `SHOTS=<dossier>` capture un parcours interrompu.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, createArticle, deactivate } from './lib/products.mjs';
import { invoicePdf, invoicePng } from './lib/invoice.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const visible = (locator) => locator.filter({ visible: true });
const button = (scope, name) => visible(scope.getByRole('button', { name, exact: true }));
const statCard = (page, label) => page.locator('button[aria-pressed]').filter({ hasText: label });
const stockOf = async (page, variantId) => Number((await api(page, `stock/levels/?variant=${variantId}`)).results[0].stock_quantity);

async function goto(page, path, nested) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  if (nested) nested.push(...await nestedInteractive(page));
}

/**
 * Navigation côté client (routeur Next) vers un formulaire : après l'enregistrement, son retour à la
 * page précédente reste dans l'app, comme pour l'utilisateur. Avec `page.goto`, ce retour recharge
 * le document précédent et la notification disparaît avec lui.
 */
async function open(page, path) {
  await page.evaluate((p) => window.next.router.push(p), path);
  await page.waitForURL((u) => `${u.pathname}${u.search}` === path);
  await page.waitForLoadState('networkidle');
}

/** Ligne de la liste (hors notifications, qui reprennent le nom de l'article). */
const inList = (page, text) => visible(page.locator('main').getByText(text));

async function toastShown(page, text) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
  const ok = await toast.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
  if (!ok && process.env.DEBUG) console.log('toast attendu', JSON.stringify(text), 'affichés', await page.locator('[data-sonner-toast]').allInnerTexts());
  return ok;
}

/** Ajoute un format par la recherche de la page (Entrée choisit le premier résultat). */
async function addBySearch(page, query) {
  const search = page.getByRole('combobox', { name: msg('fr', 'stock.search.label') }).first();
  await search.fill(query);
  await page.getByRole('option').first().waitFor();
  await search.press('Enter');
  await page.getByRole('textbox', { name: fmt('fr', 'stock.entry.line_quantity', { label: query }), exact: true }).filter({ visible: true }).waitFor();
}

/** Bouton principal du formulaire (le bouton flottant sur mobile, sous la carte sur desktop). */
const submitButton = (page, text) => visible(page.getByRole('button', { name: text })).last();

/** Nouvelle commande : un article au stock dépassé s'ajoute, avec l'avertissement « il passera en négatif ». */
async function checkSaleWarning(page, ctx, article) {
  const t = (key) => msg('fr', key);
  await goto(page, '/orders/new');
  if (ctx.viewport.mobile) await button(page, fmt('fr', 'orders.picker.product_trigger_title', { kind: 'both' })).first().click();
  await visible(page.locator('input[inputmode=search]')).first().fill(article.name);
  await visible(page.getByRole('button', { name: fmt('fr', 'orders.picker.add_aria', { name: article.name }), exact: true })).first().click();
  // Mobile : la fenêtre de choix reste ouverte après l'ajout, la commande est derrière.
  if (ctx.viewport.mobile) await button(page, fmt('fr', 'orders.picker.view_cart', { count: 1 })).click();
  // Stock de 1 : la deuxième unité le dépasse.
  await button(page, t('orders.new.increase_aria')).first().click();
  const warning = visible(page.getByText(t('orders.new.stock_negative_warning'), { exact: true })).first();
  const shown = await warning.waitFor({ timeout: 5000 }).then(() => true, () => false);
  report.check(shown, `${ctx.label} : nouvelle commande — 2 unités pour un stock de 1, ajout accepté, « ${t('orders.new.stock_negative_warning')} »`);
}

/** Une vente (commande enregistrée) fait passer le format en négatif ; filtre et indicateur « Négatif ». */
async function checkNegativeBySale(page, ctx, article, nested) {
  const variant = article.variants[0].id;
  const order = await api(page, 'orders/', { method: 'POST', data: { items: [{ variant, quantity: 3 }] } });
  const stock = await stockOf(page, variant);
  const summary = await api(page, 'stock/levels/summary/');
  await goto(page, '/stock', nested);
  const t = (key) => msg('fr', key);
  const card = statCard(page, t('stock.stats.negative_label'));
  const cardValue = (await card.innerText()).includes(String(summary.negative));
  await card.click();
  await page.waitForURL(/state=negative/);
  await page.waitForLoadState('networkidle');
  const rowShown = await inList(page, article.name).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  // « −2, à régulariser » dans la ligne (l'indicateur porte aussi « à régulariser »).
  const regularizeShown = await inList(page, '\u22122').count() > 0 && await inList(page, t('stock.levels.to_regularize')).count() > 1;
  const pressed = await card.getAttribute('aria-pressed');
  report.check(stock === -2 && cardValue && rowShown && regularizeShown && pressed === 'true',
  `${ctx.label} : vente de 3 sur un stock de 1 → −2 ; indicateur « Négatif » (${summary.negative}) filtre la liste, « ${t('stock.levels.to_regularize')} »`);
  return order;
}

/** Entrée rapide depuis la ligne : stock avant → après, prix prérempli, notification, ligne mise à jour. */
async function checkQuickEntry(page, ctx, article) {
  const t = (key) => msg('fr', key);
  const variant = article.variants[0].id;
  await button(page, fmt('fr', 'stock.levels.entry_for', { name: article.name })).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const quantity = dialog.getByRole('textbox', { name: t('stock.quick.quantity') });
  await quantity.fill('5');
  await dialog.getByRole('button', { name: fmt('fr', 'stock.quick.submit', { quantity: '5' }) }).click();
  const toast = await toastShown(page, fmt('fr', 'stock.quick.success', { name: article.name, quantity: '5' }));
  await page.waitForLoadState('networkidle');
  const stock = await stockOf(page, variant);
  const gone = await inList(page, article.name).waitFor({ state: 'detached', timeout: 8000 }).then(() => true, () => false);
  report.check(toast && stock === 3 && gone,
    `${ctx.label} : entrée rapide de 5 depuis la ligne → stock 3, « ${t('stock.quick.success').split(':')[0].trim()} », la ligne quitte le filtre Négatif`);
}

/** Entrée de 3 articles à la main : stocks mis à jour, notification. */
async function checkManualEntry(page, ctx, articles) {
  await open(page, '/stock/entree');
  const before = await Promise.all(articles.map((a) => stockOf(page, a.variants[0].id)));
  for (const a of articles) await addBySearch(page, a.name);
  for (const [i, a] of articles.entries()) {
    await page.getByRole('textbox', { name: fmt('fr', 'stock.entry.line_quantity', { label: a.name }), exact: true }).filter({ visible: true }).fill(String(i + 2));
  }
  const units = 2 + 3 + 4;
  await submitButton(page, fmt('fr', 'stock.entry.submit', { units, unitsLabel: String(units) })).click();
  const toast = await toastShown(page, fmt('fr', 'stock.entry.success', { count: 3, units, unitsLabel: String(units) }));
  const after = await Promise.all(articles.map((a) => stockOf(page, a.variants[0].id)));
  report.check(toast && after.every((s, i) => s === before[i] + i + 2),
    `${ctx.label} : entrée de 3 articles à la main (+2, +3, +4), notification, stocks mis à jour`);
}

/** Envoie la facture (photo PNG, ou PDF avec texte si `pdf`) et attend la revue des lignes (lecture réelle). */
async function readInvoice(page, browser, invoice, { pdf = false } = {}) {
  await open(page, '/stock/entree?mode=facture');
  const file = pdf
    ? { name: 'facture.pdf', mimeType: 'application/pdf', buffer: await invoicePdf(browser, invoice) }
    : { name: 'facture.png', mimeType: 'image/png', buffer: await invoicePng(browser, invoice) };
  await page.locator('input[type=file]').setInputFiles(file);
  await visible(page.getByText(msg('fr', 'stock.invoice.check_lines'))).first().waitFor({ timeout: 120000 });
  await page.waitForLoadState('networkidle');
}

const badgeCount = (page, key) => visible(page.getByText(msg('fr', `stock.invoice.${key}`), { exact: true })).count();

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Bouton « Choisir l'article » de la ligne dont le libellé lu contient `word`. */
const chooseFor = (page, word) => visible(page.getByRole('button', {
  name: new RegExp(`^${reEscape(fmt('fr', 'stock.invoice.choose_article_for', { label: '' }).split('«')[0])}.*${reEscape(word)}`, 'i'),
})).first();
/** Action de la fenêtre « Choisir l'article » (son nom accessible reprend la précision). */
const pickerAction = (sheet, key) => sheet.getByRole('button', { name: new RegExp(`^${reEscape(msg('fr', `stock.invoice.${key}`))}`) });

const amountOf = (value) => Number(value.replace(',', '.'));

/** Ligne associée à un article existant par la recherche de la fenêtre. */
async function pickExisting(page, word, article) {
  await chooseFor(page, word).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('combobox').fill(article.name);
  await sheet.getByRole('option').first().waitFor();
  await sheet.getByRole('combobox').press('Enter');
  await sheet.waitFor({ state: 'hidden' });
}

/** « Créer cet article » : nom prérempli sans le code, prix d'achat de la ligne, marge en direct. Rend le format créé. */
async function createFromLine(page, ctx, word, name) {
  await chooseFor(page, word).click();
  const sheet = page.getByRole('dialog');
  await pickerAction(sheet, 'create_article').click();
  const form = page.getByRole('dialog', { name: msg('fr', 'stock.invoice.create_title') });
  const field = (key) => form.getByRole('textbox', { name: msg('fr', `articles.form.${key}`) });
  await field('name').waitFor();
  const [prefilled, purchase] = [await field('name').inputValue(), await field('purchase_price').inputValue()];
  await field('name').fill(name);
  await field('selling_price').fill('5,00');
  const marginShown = await visible(form.getByText(fmt('fr', 'articles.form.margin_rate', { margin: '76' }))).count() > 0;
  const created = page.waitForResponse((r) => /\/api\/proxy\/products\/?$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.status() === 201);
  await button(form, msg('fr', 'stock.invoice.create_submit')).click();
  const product = await (await created).json();
  const toast = await toastShown(page, fmt('fr', 'stock.invoice.create_success', { name }));
  await form.waitFor({ state: 'hidden' });
  report.check(/osier/i.test(prefilled) && !prefilled.includes('4412') && amountOf(purchase) === 1.2 && marginShown && toast,
    `${ctx.label} : « Créer cet article » — nom prérempli sans le code (« ${prefilled} »), prix d'achat ${purchase}, marge 76 % en direct, article créé et associé`);
  return { id: product.id, variant: product.variants[0].id };
}

/** « Ignorer cette ligne » depuis la fenêtre « Choisir l'article ». */
async function ignoreLine(page, word) {
  await chooseFor(page, word).click();
  const sheet = page.getByRole('dialog');
  await pickerAction(sheet, 'ignore_line').click();
  await sheet.waitFor({ state: 'hidden' });
}

/**
 * Facture en PDF avec texte : une ligne associée par son nom, une associée à la main, une créée depuis
 * la ligne, des frais de port ignorés ; la suivante du même fournisseur (une photo) associe et ignore
 * seule les mêmes lignes, et une ligne ignorée se rétablit.
 */
async function checkInvoice(page, browser, ctx, { known, other, stamp, created }) {
  const supplier = `Fournisseur Audit ${stamp}`;
  const number = stamp.replace(' ', '-');
  const [carton, basket, shipping] = [
    { label: `CARTON AUDIT ${stamp}`, quantity: 6, price: '1.20' },
    { label: `REF-4412 Panier osier ${stamp}`, quantity: 3, price: '1.20' },
    { label: 'Frais de port', quantity: 1, price: '8.90' },
  ];
  await readInvoice(page, browser, { supplier, number: `FA-${number}-1`, date: '03/10/2026', lines: [{ label: known.name, quantity: 4, price: '2.50' }, carton, basket, shipping] }, { pdf: true });
  const blocked = submitButton(page, fmt('fr', 'stock.invoice.associate_to_continue', { count: 3 }));
  const pdfCard = await visible(page.getByText('facture.pdf', { exact: true })).count() > 0 && await page.locator('main img[src^="blob:"]').count() === 0;
  report.check(pdfCard && await badgeCount(page, 'associated') >= 1 && await badgeCount(page, 'to_associate') >= 3 && await blocked.isDisabled(),
    `${ctx.label} : facture PDF avec texte lue — une ligne « Associée », trois « À associer », bouton « ${fmt('fr', 'stock.invoice.associate_to_continue', { count: 3 })} » désactivé`);

  await pickExisting(page, 'CARTON', other);
  const article = await createFromLine(page, ctx, 'osier', `Audit stock Delta ${stamp}`);
  created.push(article.id);
  await ignoreLine(page, 'port');
  const ignored = await badgeCount(page, 'ignored') === 1;
  const before = await stockOf(page, other.variants[0].id);
  await submitButton(page, fmt('fr', 'stock.entry.submit', { units: 13, unitsLabel: '13' })).click();
  const toast = await toastShown(page, fmt('fr', 'stock.invoice.success', { count: 3, units: 13, unitsLabel: '13' }));
  report.check(ignored && toast && await stockOf(page, other.variants[0].id) === before + 6 && await stockOf(page, article.variant) === 3,
    `${ctx.label} : frais de port « Ignorée », facture enregistrée sans eux (+6 sur l'article choisi, +3 sur l'article créé)`);

  await checkNextInvoice(page, browser, ctx, { supplier, number, lines: [carton, basket, shipping], article });
}

/** Facture suivante du même fournisseur : associations et ligne ignorée retrouvées ; « Rétablir » puis ignorer à nouveau. */
async function checkNextInvoice(page, browser, ctx, { supplier, number, lines, article }) {
  await readInvoice(page, browser, { supplier, number: `FA-${number}-2`, date: '04/10/2026', lines });
  const ready = submitButton(page, fmt('fr', 'stock.entry.submit', { units: 9, unitsLabel: '9' }));
  report.check(await badgeCount(page, 'to_associate') === 0 && await badgeCount(page, 'ignored') === 1 && await ready.isEnabled(),
    `${ctx.label} : facture suivante du même fournisseur — articles associés et frais de port ignorés tout seuls`);

  const restoreName = new RegExp(`^${reEscape(fmt('fr', 'stock.invoice.restore_line', { label: '' }).split('«')[0])}`);
  await visible(page.getByRole('button', { name: restoreName })).first().click();
  const blocked = submitButton(page, fmt('fr', 'stock.invoice.associate_to_continue', { count: 1 }));
  const restored = await badgeCount(page, 'ignored') === 0 && await badgeCount(page, 'to_associate') === 1 && await blocked.isDisabled();
  await ignoreLine(page, 'port');
  report.check(restored && await badgeCount(page, 'ignored') === 1 && await ready.isEnabled(),
    `${ctx.label} : « Rétablir » remet la ligne « À associer » (bouton bloqué), l'ignorer à nouveau débloque l'enregistrement`);
  await ready.click();
  const toast = await toastShown(page, fmt('fr', 'stock.invoice.success', { count: 2, units: 9, unitsLabel: '9' }));
  report.check(toast && await stockOf(page, article.variant) === 6, `${ctx.label} : facture suivante enregistrée (+3 sur l'article créé)`);
}

/** Sortie pour casse au-delà du stock : refusée côté client et côté serveur. */
async function checkExitRefused(page, ctx, article) {
  const variant = article.variants[0].id;
  const stock = await stockOf(page, variant);
  await open(page, `/stock/sortie?variant=${variant}&motif=casse`);
  await page.getByRole('textbox', { name: fmt('fr', 'stock.exit.line_quantity', { label: article.name }), exact: true }).filter({ visible: true }).fill(String(stock + 1));
  await submitButton(page, new RegExp(msg('fr', 'stock.exit.submit').split('(')[0].trim())).click();
  const error = visible(page.getByText(msg('fr', 'stock.exit.insufficient').split(':')[0])).first();
  const shown = await error.waitFor({ timeout: 3000 }).then(() => true, () => false);
  const server = await page.request.fetch(`${BASE}/api/proxy/stock/exits/`, {
    method: 'POST', data: { lines: [{ variant, quantity: String(stock + 1) }], reason: 'breakage' },
  });
  report.check(shown && server.status() === 400 && await stockOf(page, variant) === stock,
    `${ctx.label} : sortie pour casse de ${stock + 1} sur un stock de ${stock} refusée (formulaire et serveur : ${server.status()})`);
}

/** Correction d'inventaire : la quantité comptée devient le stock, l'écart s'affiche. */
async function checkAdjustment(page, ctx, article) {
  const variant = article.variants[0].id;
  await open(page, `/stock/sortie?variant=${variant}&motif=correction`);
  const counted = page.getByRole('textbox', { name: fmt('fr', 'stock.exit.line_counted', { label: article.name }), exact: true }).filter({ visible: true });
  const stock = await stockOf(page, variant);
  await counted.fill('2');
  const signed = `${2 - stock > 0 ? '+' : ''}${2 - stock}`.replace('-', '\u2212');
  const gap = await visible(page.getByLabel(fmt('fr', 'stock.exit.gap_aria', { gap: signed }), { exact: true })).count();
  await submitButton(page, fmt('fr', 'stock.exit.submit_count', { count: 1 })).click();
  const toast = await toastShown(page, fmt('fr', 'stock.exit.adjust_success', { count: 1 }));
  report.check(toast && await stockOf(page, variant) === 2,
    `${ctx.label} : correction d'inventaire — compté 2 sur ${stock} (écart affiché : ${gap > 0 ? 'oui' : 'non'}), stock 2`);
}

/** Mouvements : la réservation de la commande renvoie vers la commande. */
async function checkMovements(page, ctx, article, order) {
  await goto(page, `/stock?tab=mouvements&product=${article.id}`);
  const link = visible(page.getByRole('link', { name: order.order_number, exact: true })).first();
  report.check(await link.count() === 1 && (await link.getAttribute('href')) === `/orders/${order.id}`,
    `${ctx.label} : onglet Mouvements filtré sur l'article, référence de commande ${order.order_number} en lien`);
}

/** Suppression : article jamais utilisé supprimé ; article vendu refusé (409). */
async function checkDelete(page, ctx, sold, stamp) {
  const fresh = await createArticle(page, { name: `Audit stock jamais utilisé ${stamp}`, price: '3.00', stock: 2 });
  const ok = await page.request.fetch(`${BASE}/api/proxy/products/${fresh.id}/`, { method: 'DELETE' });
  const refused = await page.request.fetch(`${BASE}/api/proxy/products/${sold.id}/`, { method: 'DELETE' });
  const body = await refused.json().catch(() => ({}));
  report.check(ok.status() === 204 && refused.status() === 409 && JSON.stringify(body).includes('désactivez-le plutôt'),
    `${ctx.label} : suppression d'un article jamais utilisé (${ok.status()}), refus pour un article vendu (${refused.status()})`);
}

async function journey(browser, page, ctx) {
  // Chiffres seulement : la lecture de la facture les reconnaît sans ambiguïté (O/0, I/1).
  const stamp = `${String(Date.now()).slice(-6)} ${ctx.viewport.name}`;
  // Mots distincts : la recherche exige chaque mot, « A » seul trouverait tous les articles.
  const make = (word, stock) => createArticle(page, { name: `Audit stock ${word} ${stamp}`, price: '10.00', stock });
  const [a, b, c] = [await make('Alpha', 1), await make('Bravo', 0), await make('Charlie', 4)];
  const created = [];
  let order = null;
  try {
    await checkSaleWarning(page, ctx, a);
    order = await checkNegativeBySale(page, ctx, a, []);
    await checkQuickEntry(page, ctx, a);
    await checkManualEntry(page, ctx, [a, b, c]);
    await checkInvoice(page, browser, ctx, { known: c, other: b, stamp, created });
    await checkExitRefused(page, ctx, c);
    await checkAdjustment(page, ctx, b);
    await checkMovements(page, ctx, a, order);
    await checkDelete(page, ctx, a, stamp);
  } catch (error) {
    // Parcours interrompu : l'échec est compté, le nettoyage et les autres vérifications continuent.
    report.check(false, `${ctx.label} : parcours interrompu — ${error.message.split('\n')[0]}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/stock-${ctx.viewport.name}.png`, fullPage: true });
  } finally {
    if (order) await api(page, `orders/${order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } }).catch(() => {});
    await deactivate(page, [a.id, b.id, c.id, ...created]);
  }
}

/** Écrans du stock et entrée rapide ouverte : console propre, aucun élément imbriqué. */
async function screens(page, locale, nested) {
  for (const path of ['/stock', '/stock?tab=mouvements', '/stock/entree', '/stock/entree?mode=facture', '/stock/sortie', '/stock/sortie?motif=correction']) {
    await goto(page, path, nested);
  }
  await goto(page, '/stock', nested);
  const entryFor = fmt(locale, 'stock.levels.entry_for', { name: '\u0000' }).split('\u0000')[0];
  await visible(page.getByRole('button', { name: entryFor })).first().click();
  await page.getByRole('dialog').waitFor();
  nested.push(...await nestedInteractive(page));
  await page.keyboard.press('Escape');
}

/** Boutique de services : /stock renvoie à l'accueil, aucune entrée Stock dans la navigation ni dans « Plus ». */
async function checkServicesShop(browser) {
  const { ctx, page, watch } = await openSession(browser, VIEWPORTS[1], { email: 'services@example.com' });
  const t = (key) => msg('fr', key);
  await goto(page, '/stock');
  const redirected = page.url().endsWith('/dashboard');
  await goto(page, '/stock/entree');
  const entryRedirected = page.url().endsWith('/dashboard');
  await goto(page, '/more');
  const links = await page.locator('a[href^="/stock"]').count();
  report.check(redirected && entryRedirected && links === 0,
    `Boutique de services : /stock et /stock/entree renvoient à l'accueil, aucun lien Stock (« ${t('layout.nav.more')} » compris)${watch.problems.map((p) => `\n      ${p}`).join('')}`);
  await ctx.close();
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const journeyLabel = `${viewport.name}px fr clair, parcours`;
  console.log(`\n=== ${journeyLabel}`);
  watch.setLabel(journeyLabel);
  page.on('dialog', (d) => d.accept());
  await journey(browser, page, { label: journeyLabel, viewport });
  page.removeAllListeners('dialog');
  report.check(watch.problems.length === 0, `${journeyLabel} : console propre${watch.problems.map((p) => `\n      ${p}`).join('')}`);
  watch.problems.length = 0;
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      if (!inMatrix(viewport, locale, theme)) continue;
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const nested = [];
      await screens(page, locale, nested);
      const problems = [...watch.problems, ...nested.map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : écrans du stock, console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      watch.problems.length = 0;
    }
  }
  await ctx.close();
}
await checkServicesShop(browser);
await browser.close();
report.finish();
