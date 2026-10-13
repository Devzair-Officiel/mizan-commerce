/**
 * Audit de la liste Articles et services (gabarit des listes), à 1440px et 360px, en clair et en
 * sombre, en français et en arabe : pagination et tri côté serveur, nombres exacts dans les filtres,
 * indicateurs qui filtrent la liste, fenêtre Filtres et pastilles sur mobile.
 * La boutique d'audit reçoit 25 articles « Audit lot NN » (créés une fois, réactivés ensuite,
 * désactivés à la fin) pour dépasser une page de 20. La boutique de services vérifie qu'aucun
 * stock n'apparaît (indicateurs, filtre, colonne).
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { allResults, api, createArticle, deactivate } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const LOT = 25;
const lotName = (n) => `Audit lot ${String(n).padStart(2, '0')}`;

const visibleButton = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const subtitle = (page) => page.locator('h1 + p');
const statCard = (page, label) => page.locator('button[aria-pressed]').filter({ hasText: label });
const filterMenu = (page, title) => page.locator('button[aria-haspopup="menu"]').filter({ hasText: title });

/** Attend que `read()` renvoie `expected` (liste rechargée après une navigation). */
async function settles(read, expected, timeout = 8000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    value = await read().catch(() => undefined);
    if (value === expected) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`      attendu « ${expected} », obtenu « ${value} »`);
  return false;
}

/**
 * 25 articles à un format : un tiers en rupture, un tiers en stock faible (2 pour un seuil de 5),
 * un tiers en stock. Créés une seule fois puis réactivés : l'audit reste relançable.
 */
async function ensureLot(page) {
  const existing = await allResults(page, `products/?state=all&search=${encodeURIComponent('Audit lot')}`);
  const ids = [];
  for (let n = 1; n <= LOT; n += 1) {
    const found = existing.find((p) => p.name === lotName(n));
    if (found && !found.is_active) await api(page, `products/${found.id}/reactivate/`, { method: 'POST' });
    const product = found ?? await createArticle(page, {
      name: lotName(n), price: (2 + n * 1.25).toFixed(2), threshold: '5', stock: [0, 2, 20][n % 3],
    });
    ids.push(product.id);
  }
  return ids;
}

/** Rangées de la liste mobile : liens vers une fiche article. */
function mobileRows(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .filter((a) => /^\/products\/[0-9a-f-]{36}$/.test(a.getAttribute('href')) && a.offsetParent !== null).length);
}

/** En-tête : titre selon le type de catalogue et nombre total. */
async function checkHeader(page, t, ctx, total) {
  const title = await page.locator('h1').innerText();
  const count = fmt(ctx.locale, 'articles.list.count', { kind: 'both', count: total });
  const ok = await settles(() => subtitle(page).innerText(), count);
  report.check(ok && title.includes(fmt(ctx.locale, 'articles.list.title', { kind: 'both' }))
    && (await page.getByRole('link', { name: fmt(ctx.locale, 'articles.list.new_cta', { kind: 'both' }), exact: true }).filter({ visible: true }).count()) === 1,
  `${ctx.label} : titre, « ${count} », bouton « ${fmt(ctx.locale, 'articles.list.new_cta', { kind: 'both' })} »`);
}

/** Desktop : 20 rangées, page 2, tri par prix (en-tête) conforme à l'API. */
async function checkDesktopPaging(page, t, ctx, total) {
  const rows = page.locator('table tbody tr');
  const range = (from, to) => fmt(ctx.locale, 'ui.list.pagination_range', { from, to, total });
  const first = await settles(() => rows.count(), 20);
  report.check(first && (await page.getByText(range(1, 20), { exact: true }).count()) === 1,
    `${ctx.label} : 20 rangées, « ${range(1, 20)} »`);
  await visibleButton(page, t('ui.list.pagination_next')).click();
  await page.waitForURL(/page=2/);
  const page2 = await allResults(page, 'products/?state=all&ordering=name').then((all) => all.slice(20, 40));
  const ok = await settles(() => rows.count(), page2.length);
  report.check(ok && (await rows.first().innerText()).includes(page2[0].name)
    && (await page.getByRole('button', { name: fmt(ctx.locale, 'ui.list.pagination_page', { page: 2 }), exact: true }).getAttribute('aria-current')) === 'page',
  `${ctx.label} : page 2 (${page2.length} rangées, « ${page2[0].name} » en tête)`);

  const priceHeader = page.locator('th').filter({ hasText: t('articles.list.column_price') });
  for (const ordering of ['min_price', '-min_price']) {
    await priceHeader.locator('button').click();
    await page.waitForURL((u) => u.searchParams.get('ordering') === ordering && !u.searchParams.has('page'));
    const expected = (await api(page, `products/?state=all&ordering=${ordering}`)).results[0].name;
    const sorted = await settles(async () => (await rows.first().innerText()).includes(expected), true);
    report.check(sorted && (await priceHeader.getAttribute('aria-sort')) === (ordering.startsWith('-') ? 'descending' : 'ascending'),
      `${ctx.label} : tri ${ordering} par l'en-tête « ${t('articles.list.column_price')} », « ${expected} » en tête`);
  }
}

/** Desktop : nombres du menu Stock égaux aux facettes, puis filtre appliqué et retiré. */
async function checkDesktopFilter(page, t, ctx) {
  const facets = await api(page, 'products/facets/?state=all');
  await filterMenu(page, t('articles.list.stock_title')).click();
  const items = page.getByRole('menuitemradio');
  const counts = {};
  for (const level of ['all', 'out', 'low', 'in']) {
    const item = items.filter({ hasText: t(`articles.list.stock.${level}`) }).first();
    counts[level] = Number(await item.locator('.tabular-nums').innerText());
  }
  report.check(['all', 'out', 'low', 'in'].every((l) => counts[l] === facets.stock[l]),
    `${ctx.label} : menu « ${t('articles.list.stock_title')} » aux nombres des facettes (${JSON.stringify(counts)})`);
  await items.filter({ hasText: t('articles.list.stock.low') }).first().click();
  await page.waitForURL(/stock=low/);
  const count = fmt(ctx.locale, 'articles.list.count', { kind: 'both', count: facets.stock.low });
  const ok = await settles(() => subtitle(page).innerText(), count);
  const typeFacets = await api(page, 'products/facets/?state=all&stock=low');
  report.check(ok && typeFacets.type.service === 0,
    `${ctx.label} : « ${t('articles.list.stock.low')} » → « ${count} », plus aucun service compté`);
  await visibleButton(page, fmt(ctx.locale, 'ui.list.remove_filter', { name: t('articles.list.stock_title') })).click();
  await page.waitForURL((u) => !u.searchParams.has('stock'));
}

/** Indicateurs : un clic filtre (articles actifs à ce niveau de stock), un second le retire. */
async function checkStatCards(page, t, ctx) {
  const summary = await api(page, 'products/summary/');
  for (const [card, level, value] of [['out_label', 'out', summary.out_of_stock], ['low_label', 'low', summary.low_stock]]) {
    await page.goto(`${BASE}/products`);
    const button = statCard(page, t(`articles.list.stats.${card}`));
    await button.click();
    await page.waitForURL((u) => u.searchParams.get('stock') === level && u.searchParams.get('state') === 'active');
    const count = fmt(ctx.locale, 'articles.list.count', { kind: 'both', count: value });
    const ok = await settles(() => subtitle(page).innerText(), count);
    const pressed = await button.getAttribute('aria-pressed');
    await button.click();
    await page.waitForURL((u) => !u.searchParams.has('stock'));
    report.check(ok && pressed === 'true' && (await button.getAttribute('aria-pressed')) === 'false',
      `${ctx.label} : indicateur « ${t(`articles.list.stats.${card}`)} » (${value}) filtre la liste, second clic le retire`);
  }
}

/** Mobile : 20 rangées puis « Charger plus », fenêtre Filtres aux nombres exacts, pastille. */
async function checkMobile(page, t, ctx, total) {
  const ok = await settles(() => mobileRows(page), 20);
  await visibleButton(page, t('articles.list.load_more')).click();
  const more = await settles(() => mobileRows(page), Math.min(total, 40));
  report.check(ok && more, `${ctx.label} : 20 rangées, « ${t('articles.list.load_more')} » → ${Math.min(total, 40)}`);
  report.check((await page.getByText(fmt(ctx.locale, 'articles.list.sort.name', { dir: 'asc' }), { exact: true }).filter({ visible: true }).count()) === 1,
    `${ctx.label} : rappel du tri « ${fmt(ctx.locale, 'articles.list.sort.name', { dir: 'asc' })} »`);

  await page.getByRole('button', { name: t('ui.list.filters') }).filter({ visible: true }).first().click();
  const sheet = page.getByRole('dialog');
  // Bouton radio visuellement masqué : on touche son libellé, comme l'utilisateur.
  await sheet.locator('label').filter({ has: page.getByRole('radio', { name: new RegExp(`^${t('articles.list.stock.out')}`) }) }).click();
  const facets = await api(page, 'products/facets/?state=all&stock=out');
  const apply = fmt(ctx.locale, 'articles.filterSheet.show_results', { kind: 'both', count: facets.state.all });
  const labelled = await settles(async () => (await sheet.getByRole('button', { name: apply, exact: true }).count()) === 1, true);
  await sheet.getByRole('button', { name: apply, exact: true }).click();
  await page.waitForURL(/stock=out/);
  const remove = visibleButton(page, fmt(ctx.locale, 'ui.list.remove_filter', { name: t('articles.list.stock_title') }));
  const shown = await settles(() => mobileRows(page), Math.min(facets.state.all, 20));
  report.check(labelled && shown && (await remove.count()) === 1,
    `${ctx.label} : Filtres → « ${apply} », liste filtrée, pastille « ${t('articles.list.stock_title')} »`);
  await remove.click();
  await page.waitForURL((u) => !u.searchParams.has('stock'));
}

async function auditList(page, t, ctx, nested) {
  const total = (await api(page, 'products/?state=all')).count;
  await page.goto(`${BASE}/products`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  const html = page.locator('html');
  report.check((await html.getAttribute('class')).split(' ').includes('dark') === (ctx.theme === 'dark')
    && (await html.getAttribute('dir')) === (ctx.locale === 'ar' ? 'rtl' : 'ltr'), `${ctx.label} : thème et sens de lecture`);
  await checkHeader(page, t, ctx, total);
  if (ctx.viewport.mobile) await checkMobile(page, t, ctx, total);
  else {
    report.check((await page.locator('th').filter({ hasText: t('articles.list.column_type') }).count()) === 1,
      `${ctx.label} : colonne « ${t('articles.list.column_type')} » (boutique mixte)`);
    await checkDesktopPaging(page, t, ctx, total);
    await checkDesktopFilter(page, t, ctx);
  }
  await checkStatCards(page, t, ctx);
}

/** Boutique de services : ni indicateur, ni filtre, ni colonne de stock, aux deux tailles. */
async function checkServicesShop(browser) {
  const { ctx, page, watch } = await openSession(browser, VIEWPORTS[0], { email: 'services@example.com' });
  const t = (key) => msg('fr', key);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${BASE}/products`);
    await page.waitForLoadState('networkidle');
    const stockTexts = [t('articles.list.stats.out_label'), t('articles.list.stats.low_label')];
    const cards = await Promise.all(stockTexts.map((label) => statCard(page, label).count()));
    const stockFilter = await filterMenu(page, t('articles.list.stock_title')).count();
    const stockColumn = await page.locator('th').filter({ hasText: t('articles.list.column_stock') }).count();
    const typeColumn = await page.locator('th').filter({ hasText: t('articles.list.column_type') }).count();
    let sheetStock = 0;
    if (viewport.mobile) {
      await page.getByRole('button', { name: t('ui.list.filters') }).filter({ visible: true }).first().click();
      sheetStock = await page.getByRole('dialog').getByText(t('articles.list.stock_title'), { exact: true }).count();
      await page.keyboard.press('Escape');
    }
    report.check(cards.every((c) => c === 0) && stockFilter + stockColumn + typeColumn + sheetStock === 0
      && (await statCard(page, fmt('fr', 'articles.list.stats.active_label', { kind: 'services' })).count()) === 1,
    `Boutique de services ${viewport.name}px : « ${fmt('fr', 'articles.list.stats.active_label', { kind: 'services' })} » seul, aucun stock ni type (filtre, colonne, fenêtre)`);
  }
  report.check(watch.problems.length === 0, `Boutique de services : console propre${watch.problems.map((p) => `\n      ${p}`).join('')}`);
  await ctx.close();
}

const browser = await launch();
let lot = [];
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  if (!lot.length) lot = await ensureLot(page);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const nested = [];
      await auditList(page, (key) => msg(locale, key), { label, viewport, locale, theme }, nested);
      const problems = [...watch.problems.slice(before), ...nested.map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  if (viewport === VIEWPORTS.at(-1)) await deactivate(page, lot);
  await ctx.close();
}
await checkServicesShop(browser);
await browser.close();
report.finish();
