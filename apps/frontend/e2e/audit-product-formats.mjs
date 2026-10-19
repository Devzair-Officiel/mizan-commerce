/**
 * Audit des formats dans le formulaire article, à 1440px et 360px, en clair et en sombre, en
 * français et en arabe (tableau sur desktop, cartes empilées et « ⋯ » en fenêtre du bas sur mobile) :
 * - création d'un article à 3 formats : « Plusieurs formats » remplace Prix et Stock par « Formats
 *   et prix » (Vente et Références l'expliquent), « Même prix » et « Même seuil », marge sur la
 *   plage des formats, total du stock initial, nom en double refusé, référence d'une ligne par son
 *   menu « ⋯ », « Créer l'article et ses 3 formats » ; formats, prix, seuils et stocks initiaux
 *   relus dans l'API, sur la fiche et sur la page Stock ;
 * - modification (un format vendu) : stock en lecture seule avec « + Entrée » (entrée rapide), un
 *   4e format avec stock initial, le format vendu retiré de la vente (il ne se supprime pas), un
 *   format jamais utilisé supprimé, tout enregistré en une fois ;
 * - retour à un format unique : la dernière ligne ne se supprime pas, « Revenir à un format unique »
 *   rend les cartes Prix et Stock avec les valeurs saisies, l'article a un seul format (nom par défaut).
 * Nettoyage : commande annulée et article vendu désactivé ; l'article à format unique est supprimé.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, deactivate, remove } from './lib/products.mjs';
import { cards, textbox, visibleButton } from './lib/form.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { focusReached } from './lib/wait.mjs';

const report = createReport();
const SIZES = ['Taille S', 'Taille M', 'Taille L'];

async function goto(page, path, nested) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

async function toastShown(page, text) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
  return toast.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
}

const fields = (page, f, key) => textbox(page, f(key)).filter({ visible: true });
const titles = async (page) => (await cards(page)).map((c) => c.title);
const sorted = (product) => [...product.variants].sort((a, b) => a.position - b.position);

/** Ouvre le « ⋯ » de la ligne `name` (menu ancré sur desktop, fenêtre du bas sur mobile) et renvoie ses entrées. */
async function rowMenu(page, ctx, name) {
  await visibleButton(page, fmt(ctx.locale, 'articles.form.format_more', { name })).click();
  const items = ctx.viewport.mobile ? page.getByRole('dialog').getByRole('button') : page.getByRole('menuitem');
  await items.first().waitFor();
  return items;
}

// Libellé entier : « Supprimer » ne doit pas attraper « Supprimer la ligne ».
const whole = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

async function closeMenu(page) {
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').or(page.getByRole('menu')).first().waitFor({ state: 'detached' }).catch(() => {});
}

/** Menu « ⋯ » → « Référence » : la fenêtre s'ouvre sur le champ de la ligne, « Terminé » la referme. */
async function setReference(page, t, ctx, name, sku) {
  const items = await rowMenu(page, ctx, name);
  await items.filter({ hasText: t('articles.form.sku') }).first().click();
  const sheet = page.getByRole('dialog', { name: t('articles.form.section_reference') });
  await sheet.waitFor();
  const field = sheet.getByRole('textbox', { name: t('articles.form.sku'), exact: true });
  const focused = await focusReached(field);
  await field.fill(sku);
  await sheet.getByRole('button', { name: t('ui.form.done'), exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  return focused;
}

/** « Plusieurs formats » : Prix et Stock remplacés, Vente et Références l'expliquent, deux lignes. */
async function switchToFormats(page, t, ctx) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  await visibleButton(page, f('formats_multiple')).click();
  const list = await titles(page);
  const state = {
    cards: list.includes(f('section_formats')) && !list.includes(f('section_price')) && !list.includes(f('section_stock')),
    rows: await fields(page, f, 'format_name').count() === 2,
    focus: await fields(page, f, 'format_name').first().evaluate((el) => el === document.activeElement),
    sale: await page.getByText(f('unit_help_formats'), { exact: true }).count() === 1,
    references: await page.getByText(f('reference_formats_note'), { exact: true }).count() === 1,
  };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : « ${f('formats_multiple')} » → carte « ${f('section_formats')} » à 2 lignes (focus sur le nom), Vente et Références expliquées ${JSON.stringify(state)}`);
}

/** Trois formats : prix et seuil recopiés, marge sur la plage, total du stock initial. */
async function fillFormats(page, t, ctx) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  await visibleButton(page, f('format_add')).click();
  const names = fields(page, f, 'format_name');
  const nameFocused = await names.nth(2).evaluate((el) => el === document.activeElement);
  for (const [i, size] of SIZES.entries()) await names.nth(i).fill(size);
  await fields(page, f, 'selling_price').first().fill('20');
  await fields(page, f, 'threshold').first().fill('3');
  for (const [i, price] of ['8', '8,4', '8'].entries()) await fields(page, f, 'purchase_price').nth(i).fill(price);
  for (const [i, stock] of ['5', '7', '9'].entries()) await fields(page, f, 'initial_stock').nth(i).fill(stock);
  await visibleButton(page, f('formats_same_price')).click();
  await visibleButton(page, f('formats_same_threshold')).click();
  const prices = await fields(page, f, 'selling_price').evaluateAll((els) => els.map((el) => el.value));
  const thresholds = await fields(page, f, 'threshold').evaluateAll((els) => els.map((el) => el.value));
  const margin = await page.getByText(f('formats_margin_range', { min: '58', max: '60' }), { exact: true }).count() === 1
    && await page.getByText(f('formats_margin_varies'), { exact: true }).count() === 1;
  const total = await page.getByText(f('formats_count_stock', { count: 3, unit: 'piece', quantity: 21, stock: '21' }), { exact: true }).count() === 1;
  const state = { nameFocused, prices: prices.join() === '20,20,20', thresholds: thresholds.join() === '3,3,3', margin, total };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : 3e ligne (focus), « ${f('formats_same_price')} » et « ${f('formats_same_threshold')} » recopient la 1re ligne, « ${f('formats_margin_range', { min: '58', max: '60' })} », total 21 ${JSON.stringify(state)}`);
}

/** Un nom en double est refusé à la saisie ; corrigé, l'article et ses 3 formats sont créés. */
async function submitCreation(page, t, ctx, nested) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  const names = fields(page, f, 'format_name');
  await names.nth(2).fill(SIZES[1]);
  const submit = visibleButton(page, f('submit_create_formats', { count: 3 }));
  await submit.click();
  await page.getByText(f('format_name_taken'), { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 4000 }).catch(() => {});
  const refused = page.url().endsWith('/products/new') && (await names.nth(2).getAttribute('aria-invalid')) === 'true'
    && await page.getByText(f('format_name_taken'), { exact: true }).filter({ visible: true }).count() === 1;
  report.check(refused, `${ctx.label} : deux formats « ${SIZES[1]} » → « ${f('format_name_taken')} », rien n'est envoyé`);
  await names.nth(2).fill(SIZES[2]);
  await submit.click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
  return { id: page.url().split('/').pop(), toast: await toastShown(page, f('toast_created', { type: 'product' })) };
}

async function createWithFormats(page, t, ctx, nested) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  const name = `Audit tailles ${Date.now()}`;
  const sku = `AUD-S-${Date.now()}`;
  await goto(page, '/products/new', nested);
  await textbox(page, t('articles.form.name')).fill(name);
  await switchToFormats(page, t, ctx);
  await fillFormats(page, t, ctx);
  const focused = await setReference(page, t, ctx, SIZES[0], sku);
  const { id, toast } = await submitCreation(page, t, ctx, nested);
  const variants = sorted(await api(page, `products/${id}/`));
  const state = {
    toast, focused,
    names: variants.map((v) => v.packaging_name).join() === SIZES.join(),
    values: variants.every((v) => Number(v.selling_price) === 20 && Number(v.low_stock_threshold) === 3)
      && variants.map((v) => Number(v.purchase_price)).join() === '8,8.4,8',
    stocks: variants.map((v) => Number(v.stock_quantity)).join() === '5,7,9',
    sku: variants[0].sku === sku && !variants[1].sku,
    sheet: (await Promise.all(SIZES.map((s) => page.locator('main').getByText(s, { exact: true }).filter({ visible: true }).count()))).every((n) => n > 0),
  };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : « ${f('toast_created', { type: 'product' })} », 3 formats (prix 20, seuil 3, stocks 5/7/9, référence de « ${SIZES[0]} » saisie par son menu) sur la fiche ${JSON.stringify(state)}`);
  await goto(page, `/stock?search=${encodeURIComponent(name)}`, nested);
  const stock = await Promise.all(SIZES.map((s) => page.locator('main').getByText(s).filter({ visible: true }).first()
    .waitFor({ timeout: 8000 }).then(() => true, () => false)));
  report.check(stock.every(Boolean), `${ctx.label} : page Stock — les 3 formats de « ${name} » ${JSON.stringify(stock)}`);
  return { id, variants };
}

/** Modification : stock en lecture seule et entrée rapide sur chaque format enregistré. */
async function checkSavedRows(page, t, ctx) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  const entries = SIZES.map((s) => visibleButton(page, fmt(ctx.locale, 'stock.levels.entry_for', { name: s })));
  const counts = await Promise.all(entries.map((e) => e.count()));
  await entries[2].click();
  const quick = page.getByRole('dialog', { name: t('stock.quick.title') });
  const opened = await quick.waitFor({ timeout: 5000 }).then(() => true, () => false);
  await page.keyboard.press('Escape');
  await quick.waitFor({ state: 'detached' }).catch(() => {});
  const state = {
    rows: await fields(page, f, 'format_name').count() === 3,
    readOnly: counts.every((c) => c === 1) && await fields(page, f, 'initial_stock').count() === 0,
    header: ctx.viewport.mobile || await page.getByRole('columnheader', { name: f('current_stock') }).count() === 1,
    disabled: await visibleButton(page, f('submit_edit')).isDisabled(),
    opened,
  };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : modification — 3 formats, stock en lecture seule avec « + ${t('stock.levels.entry_short')} » (entrée rapide ouverte), bouton désactivé ${JSON.stringify(state)}`);
}

/** Ajout d'un 4e format, retrait du format vendu (non supprimable), suppression d'un format jamais utilisé. */
async function editFormats(page, t, ctx, created, order, nested) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  const { id, variants } = created;
  await goto(page, `/products/${id}/edit`, nested);
  await checkSavedRows(page, t, ctx);
  await visibleButton(page, f('format_add')).click();
  await fields(page, f, 'format_name').nth(3).fill('Taille XL');
  await fields(page, f, 'selling_price').nth(3).fill('22');
  await fields(page, f, 'initial_stock').first().fill('4');

  let items = await rowMenu(page, ctx, SIZES[0]);
  const sold = await items.filter({ hasText: whole(f('format_delete')) }).count() === 0;
  await items.filter({ hasText: f('format_deactivate') }).first().click();
  const badge = await page.getByText(t('articles.badges.inactive'), { exact: true }).filter({ visible: true }).count() === 1;
  items = await rowMenu(page, ctx, SIZES[1]);
  await items.filter({ hasText: whole(f('format_delete')) }).first().click();
  const removed = await fields(page, f, 'format_name').count() === 3;

  await visibleButton(page, f('submit_edit')).click();
  await page.waitForURL(new RegExp(`/products/${id}$`));
  const toast = await toastShown(page, f('toast_saved', { type: 'product' }));
  const saved = sorted(await api(page, `products/${id}/`));
  const byName = Object.fromEntries(saved.map((v) => [v.packaging_name, v]));
  const state = {
    sold, badge, removed, toast, order: Boolean(order),
    withdrawn: byName[SIZES[0]]?.id === variants[0].id && byName[SIZES[0]].is_active === false,
    deleted: !byName[SIZES[1]],
    added: byName['Taille XL'] && Number(byName['Taille XL'].stock_quantity) === 4 && Number(byName['Taille XL'].selling_price) === 22,
    kept: byName[SIZES[2]]?.is_active === true && Number(byName[SIZES[2]].stock_quantity) === 9,
  };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : « ${SIZES[0]} » vendu retiré de la vente (pas de « ${f('format_delete')} »), « ${SIZES[1]} » supprimé, « Taille XL » ajouté avec 4 en stock, « ${f('toast_saved', { type: 'product' })} » ${JSON.stringify(state)}`);
}

/** Une seule ligne : elle ne se supprime pas, et « Revenir à un format unique » rend Prix et Stock. */
async function backToSingle(page, t, ctx, nested) {
  const f = (key, values) => fmt(ctx.locale, `articles.form.${key}`, values);
  await goto(page, '/products/new', nested);
  await textbox(page, t('articles.form.name')).fill(`Audit unique ${Date.now()}`);
  await visibleButton(page, f('formats_multiple')).click();
  const back = visibleButton(page, f('formats_single'));
  const hiddenWithTwo = await back.count() === 0;
  await fields(page, f, 'format_name').first().fill('Pot 250 g');
  await fields(page, f, 'selling_price').first().fill('15');
  let items = await rowMenu(page, ctx, f('format_number', { index: 2 }));
  await items.filter({ hasText: whole(f('format_remove')) }).first().click();
  items = await rowMenu(page, ctx, 'Pot 250 g');
  const locked = await items.filter({ hasText: whole(f('format_remove')) }).first().isDisabled();
  await closeMenu(page);
  await back.click();
  const list = await titles(page);
  const state = {
    hiddenWithTwo, locked,
    cards: list.includes(f('section_price')) && list.includes(f('section_stock')) && !list.includes(f('section_formats')),
    price: await textbox(page, f('selling_price')).inputValue() === '15',
    noName: await textbox(page, f('format_name')).count() === 0,
  };
  await visibleButton(page, f('submit_create', { type: 'product' })).click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  const saved = await api(page, `products/${id}/`);
  state.saved = saved.variants.length === 1 && saved.variants[0].packaging_name === 'Par défaut' && Number(saved.variants[0].selling_price) === 15;
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : dernière ligne non supprimable, « ${f('formats_single')} » → Prix et Stock (prix 15 conservé), un seul format au nom par défaut ${JSON.stringify(state)}`);
  return id;
}

async function run(page, t, ctx, nested, cleanup) {
  try {
    const created = await createWithFormats(page, t, ctx, nested);
    cleanup.served.push(created.id);
    const order = await api(page, 'orders/', { method: 'POST', data: { items: [{ variant: created.variants[0].id, quantity: 1 }] } });
    cleanup.orders.push(order.id);
    await editFormats(page, t, ctx, created, order, nested);
    cleanup.unused.push(await backToSingle(page, t, ctx, nested));
  } catch (error) {
    report.check(false, `${ctx.label} : parcours interrompu — ${error.message.split('\n').slice(0, process.env.DEBUG ? 6 : 1).join('\n')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/formats-${ctx.viewport.name}-${ctx.locale}-${ctx.theme}.png`, fullPage: true });
  }
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const cleanup = { served: [], unused: [], orders: [] };
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
        await run(page, (key) => msg(locale, key), { label, viewport, locale, theme }, nested, cleanup);
        const problems = [...watch.problems.slice(before), ...nested.map((n) => `imbriqué : ${n}`)];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    for (const order of cleanup.orders) await api(page, `orders/${order}/status/`, { method: 'POST', data: { status: 'cancelled' } }).catch(() => {});
    await deactivate(page, cleanup.served);
    await remove(page, cleanup.unused);
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
