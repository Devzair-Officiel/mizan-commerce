/** Factures au gabarit : liste serveur, filtres, pagination, détail figé, actions et création d'un avoir. */
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
/** Liens des factures listées (le bouton « Nouvelle facture » mène aussi sous /invoices/). */
const ROWS = 'main a[href^="/invoices/"]:not([href="/invoices/new"])';
let fixtures;
let credits;
let initial;
let creditCustomer;

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
  const { results, count } = await response.json();
  const expected = results.length;
  await page.waitForFunction(rows => document.querySelectorAll('tbody tr').length === rows, expected);
  // 24 factures de l'audit, 2 factures et 2 avoirs semés par reset_audit_shop, puis ceux de checkCreditSheet.
  report.check(count >= 28 && expected === Math.min(count - 20, 20), `${label} : pagination serveur, seconde page`);
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
  const before = await page.locator(ROWS).count();
  const [response] = await Promise.all([
    page.waitForResponse(r => listPageResponse(r, 2)),
    page.getByRole('button', { name: text(locale, 'list.load_more'), exact: true }).click(),
  ]);
  const { results, count } = await response.json();
  const added = results.length;
  await page.waitForFunction(([rows, total]) => document.querySelectorAll(rows).length === total, [ROWS, before + added]);
  report.check(count >= 28 && added === Math.min(count - 20, 20), `${label} : Charger plus récupère la page suivante`);
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
  const number = fixtures[0].number;
  // Réponse filtrée écoutée avant la saisie : `networkidle`, déjà atteint au chargement, ne l'attend pas.
  const [response] = await Promise.all([
    page.waitForResponse(r => listPageResponse(r, 1) && new URL(r.url()).searchParams.get('search') === number),
    input.fill(number),
  ]);
  await page.waitForURL(url => url.searchParams.get('search') === number);
  const shown = (await response.json()).results.map(i => `/invoices/${i.id}`);
  await page.waitForFunction(([rows, want]) => {
    const links = new Set([...document.querySelectorAll(rows)].map(a => a.getAttribute('href')));
    return links.size === want.length && want.every(href => links.has(href));
  }, [ROWS, shown]);
  const result = await api(page, `invoices/?search=${number}`);
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
  const lines = await page.getByRole('heading', { name: text(locale, 'detail.lines_title'), exact: true }).locator('xpath=../..').boundingBox();
  const seller = await page.getByRole('heading', { name: text(locale, 'detail.seller'), exact: true }).locator('xpath=../..').boundingBox();
  // Ordre logique lu dans le sens réel du document : le vendeur suit l'objet, à droite en LTR, à gauche en RTL.
  const rtl = await page.evaluate(() => getComputedStyle(document.documentElement).direction === 'rtl');
  const sellerAfter = rtl ? seller.x + seller.width < lines.x : seller.x > lines.x + lines.width;
  report.check(page.viewportSize().width < 1024 ? seller.y > lines.y : sellerAfter,
    `${label} : objet puis vendeur dans le sens d'écriture, pile réordonnée sur mobile`);
  const logo = page.getByAltText(text(locale, 'detail.seller_logo'));
  await logo.waitFor();
  report.check(await logo.evaluate(img => img.complete && img.naturalWidth === 128), `${label} : logo émis chargé`);
  const [download] = await Promise.all([page.waitForEvent('download'), visible(page.getByRole('link', { name: text(locale, 'detail.download_pdf'), exact: true })).click()]);
  report.check((await readFile(await download.path())).subarray(0, 5).toString() === '%PDF-', `${label} : action principale télécharge le PDF`);
  const after = await api(page, `invoices/${invoice.id}/`);
  report.check(isDeepStrictEqual(after.presentation, invoice.presentation) && after.total_ttc === invoice.total_ttc, `${label} : instantané et montants enregistrés inchangés`);
  await page.screenshot({ path: `results/invoices-detail-${label.replaceAll(' ', '-')}.png`, fullPage: true });
}

/** Avoirs semés par reset_audit_shop : partiel (facture encore due) et total (« Créditée »). */
async function creditFixtures(page) {
  const notes = (await api(page, 'invoices/?kind=credit_note')).results;
  const pairs = await Promise.all(notes.map(async note => ({ note, origin: await api(page, `invoices/${note.credited_invoice}/`) })));
  const partial = pairs.find(p => !p.origin.fully_credited);
  const full = pairs.find(p => p.origin.fully_credited);
  if (pairs.length !== 2 || !partial || !full) throw new Error('Avoirs d’audit absents : relancer reset_audit_shop');
  return { partial, full };
}

/** Montant d'une ligne libellé / valeur (`DetailRow`), lu dans la locale : chiffres latins, < 1 000. */
async function rowAmount(page, label, root = 'main') {
  const value = await visible(page.locator(`${root} dl > div`).filter({ has: page.locator('dt').getByText(label, { exact: true }) }).locator('dd')).first().innerText();
  const raw = value.replace(/[^\d.,\-−]/g, '').replace('−', '-');
  return Number(raw.includes('.') ? raw.replace(/,/g, '') : raw.replace(',', '.'));
}

/** Montants négatifs : en LTR, chiffres tabulaires, signe dessiné à gauche du premier chiffre (même en RTL). */
async function negativesReadLeftToRight(page) {
  return visible(page.locator('main span[dir="ltr"]')).evaluateAll(spans => spans.length > 0 && spans.every(span => {
    const text = span.textContent; const sign = text.search(/[-−]/); const digit = text.search(/\d/);
    if (sign < 0 || digit < 0 || span.childNodes.length !== 1) return false;
    const box = i => { const r = document.createRange(); r.setStart(span.firstChild, i); r.setEnd(span.firstChild, i + 1); return r.getBoundingClientRect(); };
    return getComputedStyle(span).direction === 'ltr' && getComputedStyle(span).fontVariantNumeric.includes('tabular-nums') && box(sign).right <= box(digit).left + 0.5;
  }));
}

/** Libellés du menu Plus d'actions (refermé ensuite) ; aucun quand le menu n'a rien à proposer. */
async function menuEntries(page, locale) {
  const mobile = page.viewportSize().width < 1024;
  await page.getByRole('heading', { name: text(locale, 'detail.lines_title'), exact: true }).first().waitFor();
  const trigger = visible(page.getByRole('button', { name: msg(locale, 'ui.detail.more_actions'), exact: true }));
  if (await trigger.count() === 0) return [];
  await trigger.click();
  const popup = mobile ? page.getByRole('dialog', { name: msg(locale, 'ui.detail.actions_title') }) : page.getByRole('menu');
  const entries = popup.getByRole(mobile ? 'button' : 'menuitem').filter({ hasNotText: msg(locale, 'ui.close') });
  await entries.first().waitFor();
  const names = (await entries.allInnerTexts()).map(flat).filter(name => name && name !== msg(locale, 'ui.close'));
  await page.keyboard.press('Escape');
  await popup.waitFor({ state: 'detached' });
  return names;
}

async function checkCreditedInvoices(page, locale, label) {
  const { partial, full } = credits;
  await goto(page, `/invoices/${partial.origin.id}`);
  const card = page.getByRole('heading', { name: text(locale, 'detail.credit_notes'), exact: true }).locator('xpath=../..');
  const link = card.locator(`a[href="/invoices/${partial.note.id}"]`);
  report.check(await link.count() === 1 && (await link.innerText()).includes(partial.note.number),
    `${label} : carte Avoirs émis, numéro et lien vers l'avoir`);
  const credited = Number(partial.origin.credited_total);
  const net = Number(partial.origin.total_ttc) - credited - Number(partial.origin.amount_paid);
  report.check(credited > 0 && await rowAmount(page, text(locale, 'detail.credited')) === -credited
    && Math.abs(await rowAmount(page, text(locale, 'totals.remaining')) - net) < 0.005 && net > 0,
  `${label} : ligne Avoirs négative et reste à payer net des avoirs`);
  report.check(await negativesReadLeftToRight(page), `${label} : montants négatifs en LTR, signe à gauche`);
  const entries = await menuEntries(page, locale);
  report.check(entries.includes(text(locale, 'detail.mark_paid')) && entries.includes(text(locale, 'credit.open')),
    `${label} : facture encore due, paiement manuel et avoir proposés`);
  await page.screenshot({ path: `results/invoices-credited-partial-${label.replaceAll(' ', '-')}.png`, fullPage: true });

  await goto(page, `/invoices/${full.origin.id}`);
  report.check(await visible(page.getByText(text(locale, 'payment', { state: 'credited' }), { exact: true })).count() === 1
    && await rowAmount(page, text(locale, 'totals.remaining')) === 0, `${label} : badge Créditée et reste à payer nul`);
  const left = await menuEntries(page, locale);
  report.check(!left.includes(text(locale, 'detail.mark_paid')) && !left.includes(text(locale, 'credit.open')),
    `${label} : facture entièrement créditée, ni paiement manuel ni « Créer un avoir »`);
}

async function checkCreditNote(page, locale, label) {
  const { partial: { note, origin } } = credits;
  await goto(page, `/invoices/${note.id}`);
  const content = flat(await page.locator('main').innerText());
  const card = page.getByRole('heading', { name: text(locale, 'detail.credit_of'), exact: true }).locator('xpath=../..');
  report.check(await visible(page.getByText(text(locale, 'kind', { kind: 'credit_note' }), { exact: true })).count() === 1,
    `${label} : badge Avoir`);
  report.check(await card.locator(`a[href="/invoices/${origin.id}"]`).count() === 1
    && (await card.innerText()).includes(origin.number) && content.includes(note.credit_reason),
  `${label} : facture d'origine (numéro, lien) et motif`);
  report.check(await rowAmount(page, text(locale, 'totals.total')) === -Number(note.total_ttc)
    && await negativesReadLeftToRight(page), `${label} : totaux négatifs, signe à gauche en LTR`);
  report.check(!content.includes(text(locale, 'totals.paid')) && !content.includes(text(locale, 'totals.remaining'))
    && await page.getByRole('heading', { name: text(locale, 'account.title'), exact: true }).count() === 0
    && await page.getByRole('button', { name: msg(locale, 'ui.detail.more_actions'), exact: true }).count() === 0,
  `${label} : ni paiement, ni relevé de compte, ni menu d'état`);
  report.check(await visible(page.locator(`a[href="/api/proxy/invoices/${note.id}/pdf/"]`)).count() === 1, `${label} : PDF de l'avoir proposé`);
  await page.screenshot({ path: `results/invoices-credit-note-${label.replaceAll(' ', '-')}.png`, fullPage: true });
}

/** Facture fraîche liée à une commande (deux lignes, livraison) ; sans adresse vendeur : une recommandation. */
async function creditableInvoice(page, { withoutAddress = false } = {}) {
  creditCustomer ??= await api(page, 'customers/', { method: 'POST', data: { name: 'Recette Avoirs', first_name: 'Samir', phone: '+33698765432' } });
  // Réglages posés à chaque fois : ceux d'origine reviennent à la fin de chaque fenêtre (sans adresse ni SIRET).
  const seller = { legal_address: 'Adresse actuelle différente', siret: '12345678900012' };
  await api(page, 'shop/invoice-settings/', { method: 'PATCH', data: withoutAddress ? { ...seller, legal_address: '' } : seller });
  try {
    const order = await api(page, 'orders/', { method: 'POST', data: { customer: creditCustomer.id, shipping_amount: '6', items: [
      { product_name: 'Bougie recette', quantity: 3, unit_price: '12' }, { product_name: 'Savon recette', quantity: 2, unit_price: '5' },
    ] } });
    return await api(page, 'invoices/', { method: 'POST', data: { order_id: order.id } });
  } finally {
    if (withoutAddress) await api(page, 'shop/invoice-settings/', { method: 'PATCH', data: seller });
  }
}

/** Ouvre « Créer un avoir » depuis le menu ; la feuille attend son premier aperçu (bouton actif). */
async function openCreditSheet(page, locale) {
  const mobile = page.viewportSize().width < 1024;
  await visible(page.getByRole('button', { name: msg(locale, 'ui.detail.more_actions'), exact: true })).click();
  await page.getByRole(mobile ? 'button' : 'menuitem', { name: text(locale, 'credit.open'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: text(locale, 'credit.title') });
  const submit = sheet.getByRole('button', { name: text(locale, 'credit.submit'), exact: true });
  await ready(page, submit);
  return { sheet, submit };
}

async function ready(page, button) {
  await page.waitForFunction(el => !el.disabled, await button.elementHandle());
}

/** Écoute des créations d'avoir (POST …/credit-notes/), clé d'idempotence comprise. */
function creditPosts(page) {
  const keys = [];
  const listen = r => { if (r.method() === 'POST' && /\/credit-notes\/$/.test(new URL(r.url()).pathname)) keys.push(r.headers()['idempotency-key']); };
  page.on('request', listen);
  return { keys, stop: () => page.off('request', listen) };
}

/** Partiel : motif obligatoire, quantité bornée, aperçu serveur, recommandation à accepter, double clic. */
async function checkPartialCredit(page, locale, label) {
  const invoice = await creditableInvoice(page, { withoutAddress: true });
  const order = await api(page, `orders/${invoice.order}/`);
  await goto(page, `/invoices/${invoice.id}`);
  report.check(isDeepStrictEqual(await menuEntries(page, locale), [text(locale, 'credit.open'), text(locale, 'detail.linked_order')]),
    `${label} : « Créer un avoir » à la place d'« Annuler », paiement manuel masqué (facture liée à une commande)`);
  const { sheet, submit } = await openCreditSheet(page, locale);
  const posts = creditPosts(page);
  report.check(await sheet.getByText(text(locale, 'credit.unchanged'), { exact: true }).count() === 1
    && await rowAmount(page, text(locale, 'totals.total'), '[role="dialog"]') === -Number(invoice.total_ttc),
  `${label} : feuille ouverte, mention stock et commande, aperçu du total`);
  await submit.click();
  report.check(await sheet.getByText(text(locale, 'credit.reason_required'), { exact: true }).count() === 1 && posts.keys.length === 0,
    `${label} : motif obligatoire, rien d'envoyé`);
  await sheet.getByRole('radio', { name: text(locale, 'credit.mode_partial') }).locator('xpath=..').click();
  const bougie = sheet.getByRole('textbox', { name: text(locale, 'credit.quantity_label', { name: 'Bougie recette' }) });
  await bougie.fill('4');
  report.check(await sheet.getByText(text(locale, 'credit.quantity_invalid', { max: 3 }), { exact: true }).count() === 1 && await submit.isDisabled(),
    `${label} : quantité au-delà du reste refusée`);
  const [preview] = await Promise.all([
    page.waitForResponse(r => r.status() === 200 && r.url().includes('/credit-notes/preview') && r.request().postDataJSON()?.include_shipping === true),
    bougie.fill('2').then(() => sheet.getByRole('checkbox', { name: new RegExp(text(locale, 'credit.shipping')) }).check()),
  ]);
  const { totals } = await preview.json();
  await ready(page, submit);
  report.check(await rowAmount(page, text(locale, 'totals.total'), '[role="dialog"]') === -Number(totals.total_ttc)
    && Number(totals.shipping_amount) === 6, `${label} : mode partiel, montant de l'aperçu serveur`);
  await sheet.getByRole('textbox', { name: text(locale, 'credit.reason'), exact: true }).fill('Retour de deux bougies');
  report.check(await sheet.getByText(fmt(locale, 'invoices.editor.check.issue_title', { code: 'seller_address' }), { exact: true }).count() === 1,
    `${label} : recommandation affichée avant validation`);
  await submit.click();
  report.check(await sheet.getByText(text(locale, 'credit.error', { code: 'compliance_warnings' }), { exact: true }).count() === 1 && posts.keys.length === 0,
    `${label} : recommandations à accepter avant l'envoi`);
  await sheet.getByRole('checkbox', { name: text(locale, 'credit.warnings_accept') }).check();
  await page.screenshot({ path: `results/invoices-credit-sheet-${label.replaceAll(' ', '-')}.png` });
  await submit.dblclick();
  await page.waitForURL(url => /^\/invoices\/[\w-]+$/.test(url.pathname) && !url.pathname.endsWith(invoice.id));
  posts.stop();
  const note = await api(page, `invoices/${new URL(page.url()).pathname.split('/').pop()}/`);
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text(locale, 'credit.done') }).first();
  report.check(await toast.waitFor().then(() => true, () => false) && note.kind === 'credit_note' && note.credited_invoice === invoice.id,
    `${label} : avoir créé, redirection vers son détail et message « Avoir créé »`);
  report.check(posts.keys.length === 1 && (await api(page, `invoices/${invoice.id}/`)).credit_notes.length === 1
    && note.total_ttc === totals.total_ttc && note.credit_reason === 'Retour de deux bougies',
  `${label} : double clic, un seul avoir, montant de l'aperçu`);
  report.check((await api(page, `orders/${invoice.order}/`)).total_amount === order.total_amount, `${label} : commande inchangée`);
  return invoice;
}

/** Le proxy relaie Idempotency-Key : deux envois de la même clé renvoient le même avoir. */
async function checkCreditReplay(page, invoice, label) {
  const line = (await api(page, `invoices/${invoice.id}/`)).lines.find(l => l.description === 'Savon recette');
  const send = key => page.request.post(`${BASE}/api/proxy/invoices/${invoice.id}/credit-notes/`, {
    headers: { 'Idempotency-Key': key },
    data: { mode: 'partial', lines: [{ line: line.id, quantity: '1' }], reason: 'Savon abîmé', acknowledged_warnings: ['seller_address'] },
  });
  const key = crypto.randomUUID();
  const [first, again] = [await send(key), await send(key)];
  report.check(first.status() === 201 && again.status() === 201 && (await first.json()).id === (await again.json()).id
    && (await api(page, `invoices/${invoice.id}/`)).credit_notes.length === 2, `${label} : même clé rejouée par le proxy, même avoir`);
}

/** Total : tout le reste, sans recommandation ; la facture soldée ne propose plus l'avoir. */
async function checkTotalCredit(page, locale, label) {
  const invoice = await creditableInvoice(page);
  await goto(page, `/invoices/${invoice.id}`);
  const { sheet, submit } = await openCreditSheet(page, locale);
  report.check(await rowAmount(page, text(locale, 'totals.total'), '[role="dialog"]') === -Number(invoice.total_ttc)
    && await sheet.getByText(text(locale, 'credit.warnings_title'), { exact: true }).count() === 0,
  `${label} : mode total, tout le TTC, aucune recommandation`);
  await sheet.getByRole('textbox', { name: text(locale, 'credit.reason'), exact: true }).fill('Commande annulée par le client');
  await submit.click();
  await page.waitForURL(url => /^\/invoices\/[\w-]+$/.test(url.pathname) && !url.pathname.endsWith(invoice.id));
  const after = await api(page, `invoices/${invoice.id}/`);
  report.check(after.fully_credited && after.credit_notes.length === 1 && after.credit_notes[0].total_ttc === invoice.total_ttc,
    `${label} : avoir total créé, facture entièrement créditée`);
  await goto(page, `/invoices/${invoice.id}`);
  report.check(!(await menuEntries(page, locale)).includes(text(locale, 'credit.open')), `${label} : facture entièrement créditée sans « Créer un avoir »`);
}

async function checkCreditSheet(page, locale, label) {
  const invoice = await checkPartialCredit(page, locale, label);
  await checkCreditReplay(page, invoice, label);
  await checkTotalCredit(page, locale, label);
}

try {
  await mkdir('results', { recursive: true });
  for (const viewport of VIEWPORTS) {
    const { page, ctx, watch, setLocale, setTheme } = await openSession(browser, viewport, { email: INVOICES_EMAIL });
    try {
      fixtures ??= await setup(page);
      credits ??= await creditFixtures(page);
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
        await checkCreditedInvoices(page, locale, label);
        await checkCreditNote(page, locale, label);
        await checkCreditSheet(page, locale, label);
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
