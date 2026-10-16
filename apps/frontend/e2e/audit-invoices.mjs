/** Factures au gabarit : liste serveur, filtres, pagination, détail figé et actions. */
import { mkdir, readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { BASE, INVOICES_EMAIL, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, createArticle } from './lib/products.mjs';
import { makeImage } from './lib/photos.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const browser = await launch();
const text = (locale, key, values) => values ? fmt(locale, `invoices.${key}`, values) : msg(locale, `invoices.${key}`);
const visible = locator => locator.filter({ visible: true });
const flat = value => value.replace(/\s+/g, ' ').trim();
let fixtures;
let initial;

function listPageResponse(response, page) {
  const url = new URL(response.url());
  return response.status() === 200 && url.pathname.replace(/\/$/, '') === '/api/proxy/invoices'
    && url.searchParams.get('page') === String(page);
}

async function setup(page) {
  initial = await api(page, 'shop/invoice-settings/');
  await api(page, 'shop/invoice-settings/', { method: 'PATCH', data: {
    legal_address: '12 rue des Lilas, 75011 Paris', siret: '91234567800012', invoice_vat_regime: 'applicable',
    vat_number: 'FR12345678901', default_tax_rate: '20', invoice_color_mode: 'custom', invoice_color: '#9c4f2c',
    invoice_payment_methods: ['transfer'], invoice_iban: 'FR7630006000011234567890189',
    invoice_show_account_summary: true, invoice_show_order: true,
  } });
  const logo = await makeImage(page, 128, 128);
  const upload = await page.request.post(`${BASE}/api/proxy/shop/logo/`, { multipart: { logo } });
  if (!upload.ok()) throw new Error(`Logo audit : ${upload.status()}`);
  const customer = await api(page, 'customers/', { method: 'POST', data: { name: 'Audit Factures', first_name: 'Karima', phone: '+33612345678' } });
  const article = await createArticle(page, { name: 'Chemise de recette', price: '54.07' });
  const rows = [];
  for (let n = 0; n < 24; n += 1) {
    const order = await api(page, 'orders/', { method: 'POST', data: {
      customer: customer.id, items: n === 0 ? [{ variant: article.variants[0].id, quantity: 1 }] : [{ product_name: `Article recette ${n}`, quantity: 1, unit_price: String(10 + n) }],
      payment_status: n === 0 ? 'partial' : n % 3 === 0 ? 'paid' : 'unpaid',
      ...(n === 0 ? { amount_paid: '20' } : {}),
    } });
    rows.push(await api(page, 'invoices/', { method: 'POST', data: { order_id: order.id } }));
  }
  // Les réglages changent ensuite : le détail doit conserver couleur et coordonnées émises.
  await api(page, 'shop/invoice-settings/', { method: 'PATCH', data: { siret: '12345678900012', invoice_color: '#367762', legal_address: 'Adresse actuelle différente' } });
  return rows;
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

async function checkCards(page, locale, label) {
  for (const card of ['due', 'issued_month', 'paid_month']) {
    const button = page.getByRole('button', { name: new RegExp(text(locale, `list.stats.${card}`)) }).and(page.locator('[aria-pressed]'));
    await button.click();
    await page.waitForURL(url => url.searchParams.get(card === 'due' ? 'payment' : 'period') === card);
    await page.waitForLoadState('networkidle');
    report.check(await button.getAttribute('aria-pressed') === 'true', `${label} : indicateur ${card} applique son filtre`);
    await button.click();
    await page.waitForURL(url => !url.searchParams.has(card === 'due' ? 'payment' : 'period'));
  }
}

async function checkDesktop(page, locale, label) {
  report.check(await page.locator('tbody tr').count() === 20, `${label} : 20 factures sur la première page`);
  const [response] = await Promise.all([
    page.waitForResponse(r => listPageResponse(r, 2)),
    page.getByRole('button', { name: fmt(locale, 'ui.list.pagination_page', { page: 2 }), exact: true }).click(),
  ]);
  await page.waitForURL(/page=2/);
  const expected = (await response.json()).results.length;
  await page.waitForFunction(count => document.querySelectorAll('tbody tr').length === count, expected);
  report.check(expected === 4, `${label} : pagination serveur, seconde page`);
  await page.getByRole('columnheader', { name: text(locale, 'list.columns.total_ttc') }).getByRole('button').click();
  await page.waitForURL(url => url.searchParams.get('ordering') === '-total_ttc' && !url.searchParams.has('page'));
  await page.waitForLoadState('networkidle');
  const sorted = await api(page, 'invoices/?ordering=-total_ttc');
  report.check(await page.locator('tbody a').first().getAttribute('href') === `/invoices/${sorted.results[0].id}`
    && await page.locator('th[aria-sort=descending]').count() === 1, `${label} : tri montant décroissant côté serveur et aria-sort`);
  await page.getByRole('button', { name: new RegExp(text(locale, 'list.payment_title')) }).click();
  const facets = await api(page, 'invoices/facets/');
  const option = page.getByRole('menuitemradio').filter({ hasText: text(locale, 'list.payment_filter', { value: 'partial' }) });
  report.check((await option.innerText()).includes(String(facets.payment.partial)), `${label} : nombres du menu Paiement conformes aux facettes`);
  await option.click();
  await page.waitForURL(/payment=partial/);
  await page.getByRole('button', { name: fmt(locale, 'ui.list.remove_filter', { name: text(locale, 'list.payment_title') }), exact: true }).click();
  await page.waitForURL(url => !url.searchParams.has('payment'));
}

async function checkMobile(page, locale, label) {
  const before = await page.locator('main a[href^="/invoices/"]').count();
  const [response] = await Promise.all([
    page.waitForResponse(r => listPageResponse(r, 2)),
    page.getByRole('button', { name: text(locale, 'list.load_more'), exact: true }).click(),
  ]);
  const added = (await response.json()).results.length;
  await page.waitForFunction(count => document.querySelectorAll('main a[href^="/invoices/"]').length === count, before + added);
  report.check(added === 4, `${label} : Charger plus récupère la page suivante`);
  await page.getByRole('button', { name: msg(locale, 'ui.list.filters'), exact: true }).click();
  const sheet = page.getByRole('dialog');
  const original = page.url();
  await sheet.getByRole('radio', { name: new RegExp(text(locale, 'list.payment_filter', { value: 'partial' })) }).locator('xpath=..').click();
  report.check(page.url() === original, `${label} : choix mobile conservé en brouillon`);
  await sheet.getByRole('button', { name: new RegExp(text(locale, 'list.show_results', { count: 1 }).replace('1', '\\d+')) }).click();
  await page.waitForURL(/payment=partial/);
  await page.waitForLoadState('networkidle');
  report.check(await sheet.count() === 0, `${label} : validation explicite et fermeture de la feuille`);
  await page.getByRole('button', { name: fmt(locale, 'ui.list.remove_filter', { name: text(locale, 'list.payment_title') }), exact: true }).click();
  await page.waitForURL(url => !url.searchParams.has('payment'));
}

async function checkSearch(page, locale, label) {
  const input = page.getByRole('searchbox', { name: text(locale, 'list.search_label') });
  await input.fill(fixtures[0].number);
  await page.waitForURL(url => url.searchParams.get('search') === fixtures[0].number);
  await page.waitForLoadState('networkidle');
  const result = await api(page, `invoices/?search=${fixtures[0].number}`);
  report.check(result.count === 1 && await page.locator(`main a[href="/invoices/${fixtures[0].id}"]`).count() === 1,
    `${label} : recherche numéro côté serveur`);
  await input.fill('Karima Audit');
  await page.waitForURL(url => url.searchParams.get('search') === 'Karima Audit');
  await page.waitForLoadState('networkidle');
  report.check((await api(page, 'invoices/?search=Karima%20Audit')).count === 24, `${label} : recherche sur le nom complet du client`);
}

async function checkDetail(page, locale, label) {
  const invoice = fixtures[0];
  await goto(page, `/invoices/${invoice.id}`);
  const content = flat(await page.locator('main').innerText());
  const preview = page.locator('[data-invoice-document-preview]');
  report.check(await preview.getAttribute('data-accent') === '#9c4f2c'
    && ['912 345 678 00012', 'FR76 3000 6000 0112 3456 7890 189', '12 rue des Lilas'].every(v => content.includes(v)),
  `${label} : coordonnées et couleur de l’instantané malgré les nouveaux réglages`);
  report.check(!content.includes('EUR') && !content.includes('(Par défaut)') && !content.includes('Adresse actuelle différente'),
    `${label} : symbole monétaire, format par défaut masqué, aucune édition de montant`);
  report.check(await page.getByRole('heading', { name: text(locale, 'account.title'), exact: true }).count() === 1
    && await page.locator('main input, main textarea').count() === 0, `${label} : compte client présent et montants en lecture seule`);
  const left = await page.getByRole('heading', { name: text(locale, 'detail.lines_title'), exact: true }).locator('xpath=../..').boundingBox();
  const right = await page.getByRole('heading', { name: text(locale, 'detail.seller'), exact: true }).locator('xpath=../..').boundingBox();
  report.check(page.viewportSize().width < 1024 ? right.y > left.y : right.x > left.x + left.width,
    `${label} : objet à gauche et vendeur à droite, pile réordonnée sur mobile`);
  const logo = page.getByAltText(text(locale, 'detail.seller_logo'));
  await logo.waitFor();
  report.check(await logo.evaluate(img => img.complete && img.naturalWidth === 128), `${label} : logo émis chargé`);
  const [download] = await Promise.all([page.waitForEvent('download'), visible(page.getByRole('link', { name: text(locale, 'detail.download_pdf'), exact: true })).click()]);
  report.check((await readFile(await download.path())).subarray(0, 5).toString() === '%PDF-', `${label} : action principale télécharge le PDF`);
  const after = await api(page, `invoices/${invoice.id}/`);
  report.check(isDeepStrictEqual(after.presentation, invoice.presentation) && after.total_ttc === invoice.total_ttc, `${label} : instantané et montants enregistrés inchangés`);
  await page.screenshot({ path: `results/invoices-detail-${label.replaceAll(' ', '-')}.png`, fullPage: true });
}

async function checkCancellation(page, locale, label) {
  const invoice = fixtures.find(i => i.id !== fixtures[0].id && i.status === 'issued');
  const mobile = page.viewportSize().width < 1024;
  await goto(page, `/invoices/${invoice.id}`);
  await visible(page.getByRole('button', { name: msg(locale, 'ui.detail.more_actions'), exact: true })).click();
  report.check(await page.getByRole(mobile ? 'button' : 'menuitem', { name: text(locale, 'detail.mark_paid'), exact: true }).count() === 0,
    `${label} : paiement manuel masqué pour une facture liée à une commande`);
  const entry = mobile ? page.getByRole('button', { name: text(locale, 'detail.cancel_invoice'), exact: true }) : page.getByRole('menuitem', { name: text(locale, 'detail.cancel_invoice'), exact: true });
  await entry.click();
  const dialog = page.getByRole('dialog');
  const keep = dialog.getByRole('button', { name: text(locale, 'detail.keep_invoice'), exact: true });
  report.check(await keep.evaluate(el => el === document.activeElement), `${label} : confirmation destructive, focus sur Conserver`);
  await keep.click();
  report.check((await api(page, `invoices/${invoice.id}/`)).status === 'issued', `${label} : fermer la confirmation conserve la facture`);
  await visible(page.getByRole('button', { name: msg(locale, 'ui.detail.more_actions'), exact: true })).click();
  await entry.click();
  await Promise.all([
    page.waitForResponse(r => r.url().includes(`/invoices/${invoice.id}/`) && r.request().method() === 'GET'),
    dialog.getByRole('button', { name: text(locale, 'detail.confirm'), exact: true }).click(),
  ]);
  const cancelled = await api(page, `invoices/${invoice.id}/`);
  report.check(cancelled.status === 'cancelled' && cancelled.number === invoice.number && cancelled.total_ttc === invoice.total_ttc,
    `${label} : annulation confirmée, numéro et montants conservés`);
  invoice.status = 'cancelled';
}

try {
  await mkdir('results', { recursive: true });
  for (const viewport of VIEWPORTS) {
    const { page, ctx, watch, setLocale, setTheme } = await openSession(browser, viewport, { email: INVOICES_EMAIL });
    try {
      fixtures ??= await setup(page);
      for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name} ${locale} ${theme}`;
        watch.setLabel(label);
        await setLocale(locale); setTheme(theme);
        await goto(page, '/invoices');
        await checkCards(page, locale, label);
        await goto(page, '/invoices');
        if (viewport.mobile) await checkMobile(page, locale, label); else await checkDesktop(page, locale, label);
        await checkSearch(page, locale, label);
        await page.screenshot({ path: `results/invoices-list-${label.replaceAll(' ', '-')}.png`, fullPage: true });
        await checkDetail(page, locale, label);
        await checkCancellation(page, locale, label);
        report.check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${label} : aucune largeur débordante`);
        report.check((await nestedInteractive(page)).length === 0, `${label} : aucun élément interactif imbriqué`);
      }
    } finally {
      if (initial) await api(page, 'shop/invoice-settings/', { method: 'PATCH', data: initial });
      report.check(watch.problems.length === 0, `${viewport.name} : console propre${watch.problems.map(p => `\n      ${p}`).join('')}`);
      await ctx.close();
    }
  }
} finally { await browser.close(); }
report.finish();
