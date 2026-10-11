/**
 * Audit du formulaire article (gabarit des formulaires, version 2), à 1440px et 360px, en clair et
 * en sombre, en français et en arabe : création d'un article (photo, prix d'achat, stock initial)
 * et d'un service, puis modification de chacun ; résumés des sections repliées, unité en lecture
 * seule, garde « quitter sans enregistrer », notifications ; article à plusieurs formats.
 * La boutique de services n'affiche ni stock ni unité ; celle de Youssef reste intacte.
 * Les articles créés (« Audit article … », « Audit service … ») sont supprimés à la fin (ils n'ont jamais servi) ;
 * l'article à plusieurs formats, réutilisé d'un passage à l'autre, est désactivé.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { allResults, api, createArticle, deactivate, remove } from './lib/products.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const FORMATS_NAME = 'Audit formats';
// PNG 1×1 valide : la photo passe les contrôles de type et de taille du serveur.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const visibleButton = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const textbox = (page, name) => page.getByRole('textbox', { name, exact: true });
// En-tête d'une section repliable : un <button> dans un <h3>.
const sectionButton = (page, title) => page.locator('form h3 > button').filter({ hasText: title });
const isFocused = (locator) => locator.evaluate((el) => el === document.activeElement);

/** Le texte ICU `key` (avec `values`) apparaît, un montant formaté pouvant remplacer `{price}`. */
function includesMessage(text, locale, key, values) {
  return fmt(locale, key, { ...values, price: '\u0000' }).split('\u0000').every((part) => text.includes(part));
}

async function toastShown(page, text) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text }).first();
  return toast.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
}

/** Ouvre la section, remplit les champs, la referme : son résumé est renvoyé. */
async function fillSection(page, title, fill) {
  const section = sectionButton(page, title);
  await section.click();
  await fill();
  await section.click();
  return section.innerText();
}

async function goto(page, path, nested) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

async function checkLeaveGuard(page, t, ctx, backLabel) {
  let asked = '';
  page.once('dialog', (dialog) => { asked = dialog.message(); dialog.dismiss(); });
  await visibleButton(page, ctx.viewport.mobile ? backLabel : t('ui.form.cancel')).click();
  await page.waitForTimeout(300);
  report.check(asked === t('layout.common.confirm_leave') && page.url().endsWith('/edit'),
    `${ctx.label} : quitter sans enregistrer demande confirmation, refus → reste sur le formulaire`);
}

async function createArticleWithForm(page, t, ctx, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await goto(page, '/products/new', nested);
  const sections = ['section_photo', 'section_purchase', 'section_stock', 'section_reference', 'section_description'];
  const expanded = await Promise.all(sections.map((k) => sectionButton(page, t(`articles.form.${k}`)).getAttribute('aria-expanded')));
  const unit = page.getByRole('combobox', { name: t('articles.form.unit') });
  report.check((await page.locator('h1').innerText()).includes(f('title_new', { kind: 'both' }))
    && (await page.getByRole('radio', { name: new RegExp(`^${t('articles.form.type_product')}`) }).isChecked())
    && expanded.every((v) => v === 'false') && (await unit.count()) === 1
    && (await page.getByText(t('articles.form.unit_help'), { exact: true }).count()) === 1,
  `${label} : « ${f('title_new', { kind: 'both' })} », Article choisi, unité et son aide, cinq sections repliées`);

  await visibleButton(page, f('submit_create', { type: 'product' })).click();
  const name = textbox(page, t('articles.form.name'));
  report.check((await name.getAttribute('aria-invalid')) === 'true' && await isFocused(name)
    && (await page.getByText(t('articles.form.name_required'), { exact: true }).count()) === 1,
  `${label} : « ${t('articles.form.name')} » vide → « ${t('articles.form.name_required')} », focus sur le champ`);

  await name.fill(`Audit article ${Date.now()}`);
  await textbox(page, t('articles.form.selling_price')).fill('20');
  const photo = await fillSection(page, t('articles.form.section_photo'),
    () => page.locator('input[type=file]').setInputFiles({ name: 'audit.png', mimeType: 'image/png', buffer: PNG }));
  let margin = '';
  const purchase = await fillSection(page, t('articles.form.section_purchase'), async () => {
    await textbox(page, t('articles.form.purchase_price')).fill('8');
    margin = await page.getByLabel(t('articles.form.margin'), { exact: true }).innerText();
  });
  const stock = await fillSection(page, t('articles.form.section_stock'), async () => {
    await textbox(page, t('articles.form.initial_stock')).fill('12');
    await textbox(page, t('articles.form.threshold')).fill('5');
  });
  report.check(photo.includes(f('photo_summary')) && margin === f('margin_value', { margin: '60' })
    && includesMessage(purchase, locale, 'articles.form.purchase_summary', { margin: '60' })
    && stock.includes(f('stock_summary_both', { stock: '12', threshold: '5' })),
  `${label} : résumés « ${f('photo_summary')} », « ${f('purchase_summary', { price: '8 €', margin: '60' })} », « ${f('stock_summary_both', { stock: '12', threshold: '5' })} »`);

  await visibleButton(page, f('submit_create', { type: 'product' })).click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  const toast = await toastShown(page, f('toast_created', { type: 'product' }));
  const saved = await api(page, `products/${id}/`);
  const [variant] = saved.variants;
  report.check(toast && saved.primary_image && Number(variant.purchase_price) === 8 && Number(variant.stock_quantity) === 12
    && Number(variant.low_stock_threshold) === 5 && variant.unit === 'piece',
  `${label} : « ${f('toast_created', { type: 'product' })} », photo, prix d'achat, stock 12 et seuil 5 enregistrés`);
  return id;
}

async function editArticle(page, t, ctx, id, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await goto(page, `/products/${id}/edit`, nested);
  const product = await api(page, `products/${id}/`);
  const submit = visibleButton(page, t('articles.form.submit_edit'));
  const unit = textbox(page, t('articles.form.unit'));
  const summaries = await Promise.all(['section_photo', 'section_purchase', 'section_stock']
    .map((k) => sectionButton(page, t(`articles.form.${k}`)).innerText()));
  report.check((await submit.isDisabled()) && (await unit.getAttribute('readonly')) !== null
    && (await page.locator('form p').filter({ hasText: t('articles.form.type_product') }).count()) === 1
    && summaries[0].includes(f('photo_summary')) && includesMessage(summaries[1], locale, 'articles.form.purchase_summary', { margin: '60' })
    && summaries[2].includes(f('stock_summary_both', { stock: '12', threshold: '5' })),
  `${label} : modification d'un article — bouton désactivé, type en badge, unité en lecture seule, résumés à l'ouverture`);

  const section = sectionButton(page, t('articles.form.section_stock'));
  await section.click();
  const link = page.getByRole('link', { name: t('articles.form.stock_in_link') });
  report.check((await page.locator('output').filter({ hasText: '12' }).count()) === 1
    && (await link.getAttribute('href')).startsWith(`/stock/entree?variant=${product.variants[0].id}`),
  `${label} : stock actuel 12 en lecture seule, lien « ${t('articles.form.stock_in_link')} »`);
  await textbox(page, t('articles.form.threshold')).fill('3');
  await section.click();
  report.check((await section.innerText()).includes(f('stock_summary_both', { stock: '12', threshold: '3' })) && (await submit.isEnabled()),
    `${label} : seuil modifié → résumé « ${f('stock_summary_both', { stock: '12', threshold: '3' })} », bouton actif`);
  await checkLeaveGuard(page, t, ctx, product.name);
  await submit.click();
  await page.waitForURL(new RegExp(`/products/${id}$`));
  const toast = await toastShown(page, f('toast_saved', { type: 'product' }));
  const saved = await api(page, `products/${id}/`);
  report.check(toast && Number(saved.variants[0].low_stock_threshold) === 3,
    `${label} : « ${f('toast_saved', { type: 'product' })} », seuil 3 enregistré`);
}

/** Ni unité, ni prix d'achat, ni stock, ni référence pour un service. */
async function noArticleFields(page, t) {
  const counts = await Promise.all([
    page.getByRole('combobox', { name: t('articles.form.unit') }).count(),
    textbox(page, t('articles.form.unit')).count(),
    ...['section_purchase', 'section_stock', 'section_reference'].map((k) => sectionButton(page, t(`articles.form.${k}`)).count()),
  ]);
  return counts.every((c) => c === 0);
}

async function createService(page, t, ctx, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await goto(page, '/products/new?type=service', nested);
  report.check((await page.getByRole('radio', { name: new RegExp(`^${t('articles.form.type_service')}`) }).isChecked())
    && await noArticleFields(page, t),
  `${label} : création d'un service — Service choisi, ni unité, ni prix d'achat, ni stock, ni référence`);
  await textbox(page, t('articles.form.name')).fill(`Audit service ${Date.now()}`);
  await textbox(page, t('articles.form.selling_price')).fill('35');
  const text = 'Séance de 45 minutes, sur rendez-vous.';
  const summary = await fillSection(page, t('articles.form.section_description'),
    () => page.getByRole('textbox', { name: t('articles.form.description') }).fill(text));
  report.check(summary.includes(text), `${label} : résumé de « ${t('articles.form.section_description')} » = début du texte`);
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
    && (await page.locator('form p').filter({ hasText: t('articles.form.type_service') }).count()) === 1,
  `${label} : modification d'un service — type en badge, ni unité ni stock`);
  await textbox(page, t('articles.form.selling_price')).fill('40');
  await visibleButton(page, t('articles.form.submit_edit')).click();
  await page.waitForURL(new RegExp(`/products/${id}$`));
  const saved = await api(page, `products/${id}/`);
  report.check(await toastShown(page, f('toast_saved', { type: 'service' })) && Number(saved.variants[0].selling_price) === 40,
    `${label} : « ${f('toast_saved', { type: 'service' })} », prix 40 enregistré`);
}

/** Plusieurs formats : informations communes seulement, lien « Gérer les formats ». */
async function checkFormats(page, t, ctx, id, nested) {
  await goto(page, `/products/${id}/edit`, nested);
  const link = page.getByRole('link', { name: t('articles.form.manage_formats') });
  report.check((await page.getByText(fmt(ctx.locale, 'articles.form.formats_note', { count: 2 }), { exact: true }).count()) === 1
    && (await link.getAttribute('href')) === `/products/${id}`
    && (await textbox(page, t('articles.form.selling_price')).count()) === 0 && await noArticleFields(page, t),
  `${ctx.label} : article à 2 formats — note, lien « ${t('articles.form.manage_formats')} », ni prix, ni unité, ni stock`);
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
  const edit = await noArticleFields(page, t) && (await page.locator('form p').filter({ hasText: t('articles.form.type_service') }).count()) === 0;
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

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const formats = await ensureFormatsProduct(page);
  const created = [];
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const nested = [];
      const t = (key) => msg(locale, key);
      const run = { label, viewport, locale, theme };
      const article = await createArticleWithForm(page, t, run, nested);
      await editArticle(page, t, run, article, nested);
      const service = await createService(page, t, run, nested);
      await editService(page, t, run, service, nested);
      await checkFormats(page, t, run, formats.id, nested);
      created.push(article, service);
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
await browser.close();
report.finish();
