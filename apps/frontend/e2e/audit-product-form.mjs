/**
 * Audit du formulaire article (gabarit de formulaire v3), à 1440px et 360px, en clair et en
 * sombre, en français et en arabe :
 * - création d'un article : disposition (deux colonnes sur desktop, Photo et Référence à côté, tout
 *   visible ; cartes empilées sur mobile dans l'ordre Informations, Prix, Stock, Photo, Référence,
 *   facultatives repliées), unité de vente entre le nom et la description, suffixes du prix et du
 *   stock qui suivent l'unité choisie, « Nom » obligatoire, marge en direct, deux photos (très haute puis très large)
 *   recadrées en carré, la seconde choisie comme principale, stock initial, scan du code-barres
 *   (Entrée ne soumet pas), « Article créé », valeurs relues dans l'API ;
 * - modification par « Gérer les photos » de la fiche (formulaire ouvert sur la carte Photo) :
 *   bouton désactivé, type en badge, unité en lecture seule, résumés (mobile), stock actuel et lien,
 *   photo retirée, photo enregistrée recadrée, garde « quitter sans enregistrer », « Article enregistré » ;
 * - service : Informations, Prix et Photo seulement ; création puis modification du prix ;
 * - article à deux formats (« Audit formats ») : tableau « Formats et prix » à la place de Prix et Stock.
 * La boutique de services n'affiche ni stock ni unité ; celle de Youssef reste intacte.
 * Les articles créés sont supprimés à la fin (ils n'ont jamais servi) ; « Audit formats » est désactivé.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { allResults, api, createArticle, deactivate, remove } from './lib/products.mjs';
import { makeImage } from './lib/photos.mjs';
import { cardToggle, cards, closeCard, fillCard, isFocused, layoutOk, openCard, textbox, visibleButton } from './lib/form.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { dismissedDialog, focusReached } from './lib/wait.mjs';

const report = createReport();
const FORMATS_NAME = 'Audit formats';
const ORDER = ['section_info', 'section_price', 'section_stock', 'section_photo', 'section_reference'];
const SIDE = ['section_photo', 'section_reference'];
const images = {};

/** Le texte ICU `key` apparaît dans `text`, la valeur `'\u0000'` d'un paramètre pouvant être n'importe quoi (montant formaté). */
function includesMessage(text, locale, key, values) {
  return fmt(locale, key, values).split('\u0000').every((part) => text.includes(part));
}

async function toastShown(page, text) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
  return toast.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
}

async function goto(page, path, nested) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Requêtes d'écriture sur les photos pendant `action` (« POST 201 », « PATCH 200 »…). */
async function photoCalls(page, action) {
  const calls = [];
  const listen = (res) => {
    // Les redirections (barre oblique finale) ne comptent pas : seule la réponse finale du proxy.
    const method = res.request().method();
    const redirect = res.status() >= 300 && res.status() < 400;
    if (/\/api\/proxy\/products\/[^/]+\/images(\/|$)/.test(res.url()) && method !== 'GET' && !redirect) calls.push(`${method} ${res.status()}`);
  };
  page.on('response', listen);
  await action();
  await page.waitForLoadState('networkidle');
  page.off('response', listen);
  return calls;
}

/** Recadrage 1:1 ouvert, validé, refermé. */
async function confirmCrop(page, t) {
  // Fenêtre repérée par son nom : pendant le traitement, « Valider » devient « Traitement… ».
  const dialog = page.getByRole('dialog', { name: t('ui.crop.title'), exact: true });
  await dialog.getByRole('button', { name: t('ui.crop.confirm'), exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}

// Type en badge (modification) : le texte exact du badge, pas un paragraphe qui contient le mot.
const typeBadge = (page, text) => page.locator('form p > span').filter({ hasText: new RegExp(`^${text}$`) });
const thumb = (page, locale, index) => page.getByRole('button', { name: fmt(locale, 'articles.form.photo_thumb', { index }), exact: true });

async function addPhoto(page, t, file) {
  // La carte Photo : le scan d'emballage a aussi son champ fichier, en tête du formulaire.
  await page.locator('#photos input[type=file]').setInputFiles(file);
  await confirmCrop(page, t);
}

const layout = (t) => ({ order: ORDER.map((k) => t(`articles.form.${k}`)), side: SIDE.map((k) => t(`articles.form.${k}`)) });

/** Deux photos recadrées en carré ; la seconde devient la principale. */
async function addPhotos(page, t, ctx) {
  const { label, locale } = ctx;
  const title = t('articles.form.section_photo');
  await openCard(page, ctx, title);
  await addPhoto(page, t, images.tall);
  await addPhoto(page, t, images.wide);
  const first = await thumb(page, locale, 1).getAttribute('aria-pressed');
  await thumb(page, locale, 2).click();
  const second = await thumb(page, locale, 2).getAttribute('aria-pressed');
  const summary = await closeCard(page, ctx, title);
  report.check(first === 'true' && second === 'true'
    && (!ctx.viewport.mobile || summary.includes(fmt(locale, 'articles.form.photo_summary', { count: 2 }))),
  `${label} : photos haute puis large recadrées en carré, la seconde choisie comme principale${ctx.viewport.mobile ? `, résumé « ${fmt(locale, 'articles.form.photo_summary', { count: 2 })} »` : ''}`);
}

/** Bouton de scan : focus sur le code-barres et aide ; Entrée (fin de scan) ne soumet pas le formulaire. */
async function scanBarcode(page, t, ctx, code) {
  const title = t('articles.form.section_reference');
  await openCard(page, ctx, title);
  await visibleButton(page, t('articles.form.scan_barcode')).click();
  const field = textbox(page, t('articles.form.barcode'));
  // Le focus arrive juste après le clic : on l'attend (2 s au plus).
  const focused = await focusReached(field);
  const help = await page.getByRole('status').filter({ hasText: t('articles.form.scan_help') }).count();
  await page.keyboard.type(code);
  await page.keyboard.press('Enter');
  // Entrée ne doit rien envoyer : plus aucune requête en cours, on est toujours sur le formulaire.
  await page.waitForLoadState('networkidle');
  const summary = await closeCard(page, ctx, title);
  const state = { focused, help: help === 1, stayed: page.url().endsWith('/products/new'),
    summary: !ctx.viewport.mobile || summary.includes(fmt(ctx.locale, 'articles.form.barcode_summary', { barcode: code })) };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : « ${t('articles.form.scan_barcode')} » → focus sur le code-barres et aide, Entrée ne soumet pas ${JSON.stringify(state)}`);
}

async function checkMargin(page, t, ctx) {
  const before = await page.getByText(fmt(ctx.locale, 'articles.form.margin_rate', { margin: '60' })).count();
  await textbox(page, t('articles.form.purchase_price')).fill('8');
  const box = page.locator('form p').filter({ hasText: fmt(ctx.locale, 'articles.form.margin_rate', { margin: '60' }) });
  const text = (await box.count()) === 1 ? await box.innerText() : '';
  report.check(before === 0 && includesMessage(text, ctx.locale, 'articles.form.margin_amount', { unit: 'piece', amount: '\u0000' }),
    `${ctx.label} : marge affichée seulement avec les deux prix, « ${text.replace(/\s+/g, ' ')} »`);
}

/** Suffixe affiché dans le champ `label` (« € / kg », « kg »). */
const suffixOf = (page, label) => textbox(page, label).locator('xpath=following-sibling::span').innerText();

async function chooseUnit(page, t, unit) {
  await page.getByRole('combobox', { name: t('articles.form.unit') }).click();
  await page.getByRole('option', { name: t(`articles.units.${unit}`), exact: true }).click();
}

/** Unité entre le nom et la description ; prix et stock suivent l'unité choisie (kg), puis retour à la pièce. */
async function checkUnit(page, t, ctx) {
  const { locale } = ctx;
  const short = (unit) => fmt(locale, 'articles.form.unit_short', { unit });
  const price = (text, unit) => includesMessage(text, locale, 'articles.form.price_suffix', { currency: '\u0000', unit: short(unit) });
  const tops = await Promise.all([textbox(page, t('articles.form.name')), page.getByRole('combobox', { name: t('articles.form.unit') }),
    page.getByRole('textbox', { name: t('articles.form.description') })].map(async (l) => (await l.boundingBox()).y));
  const piece = await suffixOf(page, t('articles.form.selling_price'));
  await chooseUnit(page, t, 'kilogram');
  const kg = await suffixOf(page, t('articles.form.selling_price'));
  await openCard(page, ctx, t('articles.form.section_stock'));
  const stock = await suffixOf(page, t('articles.form.initial_stock'));
  await closeCard(page, ctx, t('articles.form.section_stock'));
  await chooseUnit(page, t, 'piece');
  const back = await suffixOf(page, t('articles.form.selling_price'));
  const state = { order: tops[0] < tops[1] && tops[1] < tops[2], piece: price(piece, 'piece'), kg: price(kg, 'kg'), stock: stock === short('kg'), back: price(back, 'piece') };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : unité entre nom et description ; « ${t('articles.units.kilogram')} » → prix « ${kg} », stock « ${stock} », retour à la pièce ${JSON.stringify(state)}`);
}

async function createArticleWithForm(page, t, ctx, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await goto(page, '/products/new', nested);
  const unit = page.getByRole('combobox', { name: t('articles.form.unit') });
  report.check((await page.locator('h1').innerText()).includes(f('title_new', { kind: 'both' }))
    && (await page.getByRole('radio', { name: new RegExp(`^${t('articles.form.type_product')}`) }).isChecked())
    && (await unit.count()) === 1 && await layoutOk(page, ctx, layout(t)),
  `${label} : « ${f('title_new', { kind: 'both' })} », Article choisi, unité en menu, ${ctx.viewport.mobile ? 'cartes empilées dans l\'ordre, facultatives repliées' : 'deux colonnes, rien à déplier'}`);
  await checkUnit(page, t, ctx);

  await visibleButton(page, f('submit_create', { type: 'product' })).click();
  const name = textbox(page, t('articles.form.name'));
  report.check((await name.getAttribute('aria-invalid')) === 'true' && await isFocused(name)
    && (await page.getByText(t('articles.form.name_required'), { exact: true }).count()) === 1,
  `${label} : « ${t('articles.form.name')} » vide → « ${t('articles.form.name_required')} », focus sur le champ`);

  await name.fill(`Audit article ${Date.now()}`);
  await textbox(page, t('articles.form.selling_price')).fill('20');
  await checkMargin(page, t, ctx);
  await addPhotos(page, t, ctx);
  const stock = await fillCard(page, ctx, t('articles.form.section_stock'), async () => {
    await textbox(page, t('articles.form.initial_stock')).fill('12');
    await textbox(page, t('articles.form.threshold')).fill('5');
  });
  report.check(!ctx.viewport.mobile || stock.includes(f('stock_summary_both', { stock: '12', threshold: '5' })),
    `${label} : stock initial 12 et seuil 5${ctx.viewport.mobile ? ` → résumé « ${f('stock_summary_both', { stock: '12', threshold: '5' })} »` : ''}`);
  const code = String(Date.now()).slice(-13);
  await scanBarcode(page, t, ctx, code);

  const calls = await photoCalls(page, async () => {
    await visibleButton(page, f('submit_create', { type: 'product' })).click();
    await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  });
  const id = page.url().split('/').pop();
  const toast = await toastShown(page, f('toast_created', { type: 'product' }));
  const saved = await api(page, `products/${id}/`);
  const [variant] = saved.variants;
  const sorted = [...saved.images].sort((a, b) => a.position - b.position);
  const state = { toast, photos: sorted.length === 2 && sorted[1].is_primary && calls.filter((c) => c === 'POST 201').length === 2,
    values: Number(variant.purchase_price) === 8 && Number(variant.stock_quantity) === 12 && Number(variant.low_stock_threshold) === 5 && variant.unit === 'piece',
    barcode: variant.barcode === code };
  report.check(Object.values(state).every(Boolean),
  `${label} : « ${f('toast_created', { type: 'product' })} », 2 photos (la seconde principale), prix d'achat, stock 12, seuil 5, code-barres [${calls.join(', ')}] ${JSON.stringify(state)}`);
  return id;
}

/** « Gérer les photos » de la fiche ouvre le formulaire sur la carte Photo. */
async function openFromSheet(page, t, ctx, id, nested) {
  await goto(page, `/products/${id}`, nested);
  await page.getByRole('link', { name: t('articles.sheet.photos_manage'), exact: true }).filter({ visible: true }).click();
  await page.waitForURL(new RegExp(`/products/${id}/edit\\?focus=photos$`));
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  const title = t('articles.form.section_photo');
  const photo = page.locator('#photos');
  // Défilement jusqu'à la carte : on attend qu'elle soit dans l'écran (4 s au plus).
  await photo.evaluate((el) => new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      const box = el.getBoundingClientRect();
      if ((box.top < innerHeight && box.bottom > 0) || Date.now() - start > 4000) resolve();
      else requestAnimationFrame(poll);
    };
    poll();
  }));
  const box = await photo.boundingBox();
  const opened = !ctx.viewport.mobile || (await cardToggle(page, title).getAttribute('aria-expanded')) === 'true';
  report.check(opened && box && box.y < ctx.viewport.height && box.y + box.height > 0,
    `${ctx.label} : « ${t('articles.sheet.photos_manage')} » → formulaire ouvert sur la carte Photo${ctx.viewport.mobile ? ' (dépliée)' : ''}`);
}

async function checkLeaveGuard(page, t, ctx, backLabel) {
  const asked = await dismissedDialog(page,
    () => visibleButton(ctx.viewport.mobile ? page : page.locator('form'), ctx.viewport.mobile ? backLabel : t('ui.form.cancel')).click());
  report.check(asked === t('layout.common.confirm_leave') && page.url().includes('/edit'),
    `${ctx.label} : quitter sans enregistrer demande confirmation, refus → reste sur le formulaire`);
}

/** Photo principale (la seconde) retirée de la vue : on retire la première, puis on recadre celle qui reste (enregistrée). */
async function editPhotos(page, t, ctx) {
  const { locale } = ctx;
  const pressed = await thumb(page, locale, 2).getAttribute('aria-pressed');
  await thumb(page, locale, 1).click();
  await visibleButton(page, t('articles.form.photo_remove')).click();
  const left = await page.getByRole('button', { name: /./, pressed: true }).filter({ has: page.locator('img') }).count();
  await visibleButton(page, t('articles.form.photo_crop')).click();
  await confirmCrop(page, t);
  report.check(pressed === 'true' && left === 1 && (await thumb(page, locale, 2).count()) === 0,
    `${ctx.label} : principale enregistrée relue, première photo retirée, la photo restante recadrée`);
}

async function editArticle(page, t, ctx, id, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await openFromSheet(page, t, ctx, id, nested);
  const product = await api(page, `products/${id}/`);
  const second = [...product.images].sort((a, b) => a.position - b.position)[1].id;
  const submit = visibleButton(page, t('articles.form.submit_edit'));
  const unit = page.locator('form output').filter({ hasText: t('articles.units.piece') });
  // Mobile : la carte Photo, ouverte par « Gérer les photos », est refermée pour lire son résumé.
  const summaries = ctx.viewport.mobile
    ? [await closeCard(page, ctx, t('articles.form.section_photo')), await cardToggle(page, t('articles.form.section_stock')).innerText()] : [];
  const state = {
    disabled: await submit.isDisabled(),
    unit: (await unit.count()) === 1 && (await page.getByRole('combobox', { name: t('articles.form.unit') }).count()) === 0,
    badge: (await typeBadge(page, t('articles.form.type_product')).count()) === 1,
    summaries: !ctx.viewport.mobile || (summaries[0].includes(f('photo_summary', { count: 2 })) && summaries[1].includes(f('stock_summary_both', { stock: '12', threshold: '5' }))),
  };
  report.check(Object.values(state).every(Boolean),
    `${label} : modification — bouton désactivé, type en badge, unité en lecture seule${ctx.viewport.mobile ? ', résumés Photo et Stock' : ''} ${JSON.stringify(state)}${state.summaries ? '' : ` ${JSON.stringify(summaries)}`}`);

  await openCard(page, ctx, t('articles.form.section_photo'));
  await editPhotos(page, t, ctx);
  await openCard(page, ctx, t('articles.form.section_stock'));
  const link = page.getByRole('link', { name: t('articles.form.stock_in_link') });
  report.check((await page.locator('form output').filter({ hasText: /^12$/ }).count()) === 1
    && (await link.getAttribute('href')).startsWith(`/stock/entree?variant=${product.variants[0].id}`),
  `${label} : stock actuel 12 en lecture seule, lien « ${t('articles.form.stock_in_link')} »`);
  await textbox(page, t('articles.form.threshold')).fill('3');
  await closeCard(page, ctx, t('articles.form.section_stock'));
  await checkLeaveGuard(page, t, ctx, product.name);
  const calls = await photoCalls(page, async () => {
    await submit.click();
    await page.waitForURL(new RegExp(`/products/${id}$`));
  });
  const toast = await toastShown(page, f('toast_saved', { type: 'product' }));
  const saved = await api(page, `products/${id}/`);
  report.check(toast && Number(saved.variants[0].low_stock_threshold) === 3 && saved.images.length === 1
    && saved.images[0].id === second && saved.images[0].is_primary && calls.includes('DELETE 204') && calls.includes('PUT 200'),
  `${label} : « ${f('toast_saved', { type: 'product' })} », seuil 3, une photo restante recadrée [${calls.join(', ')}]`);
}

/** Service : ni unité, ni prix d'achat, ni stock, ni référence. */
async function noArticleFields(page, t) {
  const titles = (await cards(page)).map((c) => c.title);
  const counts = await Promise.all([
    page.getByRole('combobox', { name: t('articles.form.unit') }).count(),
    page.locator('form output').filter({ hasText: t('articles.form.unit') }).count(),
    textbox(page, t('articles.form.purchase_price')).count(),
  ]);
  return counts.every((c) => c === 0) && ['section_stock', 'section_reference'].every((k) => !titles.includes(t(`articles.form.${k}`)));
}

async function createService(page, t, ctx, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await goto(page, '/products/new?type=service', nested);
  const titles = (await cards(page)).map((c) => c.title);
  report.check((await page.getByRole('radio', { name: new RegExp(`^${t('articles.form.type_service')}`) }).isChecked())
    && await noArticleFields(page, t) && ['section_info', 'section_price', 'section_photo'].every((k) => titles.includes(f(k))),
  `${label} : création d'un service — Informations, Prix et Photo ; ni unité, ni prix d'achat, ni stock, ni référence`);
  await textbox(page, t('articles.form.name')).fill(`Audit service ${Date.now()}`);
  await textbox(page, t('articles.form.selling_price')).fill('35');
  const text = 'Séance de 45 minutes, sur rendez-vous.';
  await page.getByRole('textbox', { name: t('articles.form.description') }).fill(text);
  await visibleButton(page, f('submit_create', { type: 'service' })).click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  const saved = await api(page, `products/${id}/`);
  report.check(await toastShown(page, f('toast_created', { type: 'service' })) && saved.type === 'service'
    && Number(saved.variants[0].selling_price) === 35 && saved.description === text,
  `${label} : « ${f('toast_created', { type: 'service' })} », prix et description enregistrés`);
  return id;
}

async function editService(page, t, ctx, id, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await goto(page, `/products/${id}/edit`, nested);
  report.check(await noArticleFields(page, t)
    && (await typeBadge(page, t('articles.form.type_service')).count()) === 1,
  `${label} : modification d'un service — type en badge, ni unité ni stock`);
  await textbox(page, t('articles.form.selling_price')).fill('40');
  await visibleButton(page, t('articles.form.submit_edit')).click();
  await page.waitForURL(new RegExp(`/products/${id}$`));
  const saved = await api(page, `products/${id}/`);
  report.check(await toastShown(page, f('toast_saved', { type: 'service' })) && Number(saved.variants[0].selling_price) === 40,
    `${label} : « ${f('toast_saved', { type: 'service' })} », prix 40 enregistré`);
}

/** Plusieurs formats : tableau « Formats et prix » à la place de Prix et Stock, unité en lecture seule. */
async function checkFormats(page, t, ctx, id, nested) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  await goto(page, `/products/${id}/edit`, nested);
  const titles = (await cards(page)).map((c) => c.title);
  const names = await textbox(page, f('format_name')).filter({ visible: true }).evaluateAll((els) => els.map((el) => el.value));
  report.check(titles.includes(f('section_formats')) && !titles.includes(f('section_price')) && !titles.includes(f('section_stock'))
    && [...names].sort().join('|') === 'Lot de 6|Unité' && (await page.getByRole('combobox', { name: t('articles.form.unit') }).count()) === 0
    && (await page.getByText(f('unit_help_formats'), { exact: true }).count()) === 1,
  `${ctx.label} : article à 2 formats — carte « ${f('section_formats')} » (ses 2 formats, dans l'ordre de la fiche) à la place de Prix et Stock, unité en lecture seule ${JSON.stringify(names)}`);
}

async function ensureFormatsProduct(page) {
  const [found] = (await allResults(page, `products/?state=all&search=${encodeURIComponent(FORMATS_NAME)}`)).filter((p) => p.name === FORMATS_NAME);
  if (found && !found.is_active) await api(page, `products/${found.id}/reactivate/`, { method: 'POST' });
  return found ?? createArticle(page, { name: FORMATS_NAME, price: '4.00', variants: ['Unité', 'Lot de 6'] });
}

/** Boutique de services : formulaire sans choix de type, ni unité, ni stock (création et modification). */
async function checkServicesShop(browser) {
  const { ctx, page, watch } = await openSession(browser, VIEWPORTS[0], { email: 'services@example.com' });
  const t = (key) => msg('fr', key);
  const nested = [];
  await goto(page, '/products/new', nested);
  const creation = (await page.locator('h1').innerText()).includes(fmt('fr', 'articles.form.title_new', { kind: 'services' }))
    && (await page.getByRole('radio').count()) === 0 && await noArticleFields(page, t);
  const [service] = (await api(page, 'products/')).results;
  await goto(page, `/products/${service.id}/edit`, nested);
  const edit = await noArticleFields(page, t) && (await typeBadge(page, t('articles.form.type_service')).count()) === 0;
  const problems = [...watch.problems, ...nested.map((n) => `imbriqué : ${n}`)];
  report.check(creation && edit && problems.length === 0,
    `Boutique de services : ni type, ni unité, ni stock à la création et en modification, console propre${problems.map((p) => `\n      ${p}`).join('')}`);
  await ctx.close();
}

/** Aucun article de test dans la boutique de Youssef. */
async function checkYoussefShop(browser) {
  const { ctx, page } = await openSession(browser, VIEWPORTS[0], { email: 'youssef@example.com' });
  const data = await api(page, `products/?state=all&search=${encodeURIComponent('Audit')}`);
  report.check(data.count === 0, `Boutique de Youssef : aucun article « Audit » (${data.count})`);
  await ctx.close();
}

async function run(page, t, ctx, formats, created, nested) {
  try {
    const article = await createArticleWithForm(page, t, ctx, nested);
    created.push(article);
    await editArticle(page, t, ctx, article, nested);
    const service = await createService(page, t, ctx, nested);
    created.push(service);
    await editService(page, t, ctx, service, nested);
    await checkFormats(page, t, ctx, formats.id, nested);
  } catch (error) {
    report.check(false, `${ctx.label} : parcours interrompu — ${error.message.split('\n').slice(0, process.env.DEBUG ? 6 : 1).join('\n')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/article-${ctx.viewport.name}-${ctx.locale}-${ctx.theme}.png`, fullPage: true });
  }
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const formats = await ensureFormatsProduct(page);
    images.tall = await makeImage(page, 300, 1200);
    images.wide = await makeImage(page, 1200, 300);
    const created = [];
    for (const locale of ['fr', 'ar']) {
      for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
        console.log(`\n=== ${label}`);
        await setLocale(locale);
        setTheme(theme);
        watch.setLabel(label);
        const before = watch.problems.length;
        const nested = [];
        await run(page, (key) => msg(locale, key), { label, viewport, locale, theme }, formats, created, nested);
        const problems = [...watch.problems.slice(before), ...nested.map((n) => `imbriqué : ${n}`)];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    await remove(page, created);
    await deactivate(page, [formats.id]);
    await ctx.close();
  }
  await checkServicesShop(browser);
  await checkYoussefShop(browser);
} finally {
  await browser.close();
}
report.finish();
