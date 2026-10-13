/**
 * Audit du défilement de la page (page bloquée après plusieurs actions), à 1440px et 360px, en clair
 * et en sombre, en français et en arabe. Enchaîne ouvertures et fermetures :
 * - fenêtres : fenêtre du bas / fenêtre centrée (BottomSheet), confirmation (Dialog), recadrage d'image ;
 * - menus : « ⋯ » de la fiche et d'un format, filtres de la liste, compte (desktop), menu burger (mobile) ;
 * - liste d'options (Select) dans une fenêtre ; fenêtre ouverte depuis un menu (« ⋯ » → Modifier,
 *   compte ou burger → Apparence) ; retour arrière pendant qu'une fenêtre ou un menu est ouvert ;
 * - fermeture par Échap, par clic à l'extérieur, par le bouton ; notification après un enregistrement.
 * Après chaque action, fenêtres et menus refermés : la page défile à la molette et rien ne reste
 * bloquant sur html, body et le contenu principal (voir lib/scroll.mjs). Pendant qu'une fenêtre est
 * ouverte, la page derrière est verrouillée.
 * Article dédié (format « Lot » jamais utilisé), désactivé à la fin.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, createArticle, deactivate } from './lib/products.mjs';
import { makeImage } from './lib/photos.mjs';
import { scrollIssues } from './lib/scroll.mjs';
import { openCard } from './lib/form.mjs';

const report = createReport();
const visible = (locator) => locator.filter({ visible: true });
const button = (scope, name) => visible(scope.getByRole('button', { name, exact: true }));
const overlay = (page) => page.getByRole('dialog').or(page.getByRole('menu')).or(page.getByRole('alertdialog'));
let formats = 0;

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

/** La page derrière la fenêtre ouverte est verrouillée (html ou body sans défilement). */
const locked = (page) => page.waitForFunction(() => [document.documentElement, document.body]
  .some((el) => getComputedStyle(el).overflowY === 'hidden'), null, { timeout: 2000 }).then(() => true, () => false);

/** Une action, puis : fenêtres et menus refermés, la page défile. */
async function step(page, ctx, what, action) {
  let issues;
  try {
    await action();
    const closed = await overlay(page).first().waitFor({ state: 'hidden', timeout: 4000 }).then(() => true, () => false);
    issues = closed ? await scrollIssues(page) : ['une fenêtre ou un menu est resté ouvert'];
  } catch (error) {
    issues = [`parcours interrompu — ${error.message.split('\n')[0]}`];
    await page.keyboard.press('Escape').catch(() => {});
  }
  report.check(issues.length === 0, `${ctx.label} : ${what} → la page défile${issues.map((i) => `\n      ${i}`).join('')}`);
}

/** Clic à l'extérieur : en haut de l'écran, sur le fond de la fenêtre ou de la page. */
const clickOutside = (page, ctx) => page.mouse.click(ctx.viewport.width / 2, 12);

/** « ⋯ » de la fiche (menu sur desktop, fenêtre du bas sur mobile). */
async function openPageMenu(page, ctx) {
  await button(page, msg(ctx.locale, 'ui.detail.more_actions')).first().click();
  await overlay(page).first().waitFor();
}

/** « ⋯ » du format « Lot », puis l'entrée `key` (articles.sheet.format.*) ; attend la fenêtre ouverte. */
async function formatAction(page, ctx, article, key) {
  const name = fmt(ctx.locale, 'stock.common.variant_label', { product: article.name, format: 'Lot' });
  await button(page, fmt(ctx.locale, 'articles.sheet.format.actions_label', { name })).click();
  const items = ctx.viewport.mobile ? page.getByRole('dialog').getByRole('button') : page.getByRole('menuitem');
  await items.filter({ hasText: fmt(ctx.locale, `articles.sheet.format.${key}`) }).first().click();
  // Mobile : la fenêtre « Actions » se referme pendant que la suivante s'ouvre.
  if (ctx.viewport.mobile) await page.getByRole('dialog', { name: msg(ctx.locale, 'ui.detail.actions_title') }).waitFor({ state: 'hidden' });
  const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog')).first();
  await dialog.waitFor();
  return dialog;
}

async function openAddFormat(page, ctx) {
  await button(page, fmt(ctx.locale, 'articles.sheet.add_format')).click();
  const dialog = page.getByRole('dialog').first();
  await dialog.waitFor();
  return dialog;
}

async function checkPageMenu(page, ctx) {
  await step(page, ctx, '« ⋯ » ouvert puis Échap', async () => {
    await openPageMenu(page, ctx);
    await page.keyboard.press('Escape');
  });
  await step(page, ctx, '« ⋯ » ouvert puis clic à l\'extérieur', async () => {
    await openPageMenu(page, ctx);
    await clickOutside(page, ctx);
  });
  await step(page, ctx, '« ⋯ » ouvert puis retour arrière', async () => {
    await openPageMenu(page, ctx);
    await page.goBack();
    await page.waitForLoadState('networkidle');
  });
  await page.goForward();
  await page.waitForLoadState('networkidle');
}

async function checkFormatWindows(page, ctx, article) {
  let wasLocked = false;
  await step(page, ctx, 'fenêtre ouverte depuis le « ⋯ » d\'un format (Modifier), fermée par Échap', async () => {
    await formatAction(page, ctx, article, 'edit');
    wasLocked = await locked(page);
    await page.keyboard.press('Escape');
  });
  report.check(wasLocked, `${ctx.label} : fenêtre ouverte depuis un menu → la page derrière est verrouillée`);
  // La fenêtre du bas (mobile) n'a pas de bouton « Fermer » : clic sur le fond.
  await step(page, ctx, `Modifier un format, fenêtre fermée par ${ctx.viewport.mobile ? 'clic sur le fond' : '« Fermer »'}`, async () => {
    const dialog = await formatAction(page, ctx, article, 'edit');
    if (ctx.viewport.mobile) await clickOutside(page, ctx);
    else await button(dialog, msg(ctx.locale, 'ui.close')).click();
  });
  await step(page, ctx, 'confirmation de suppression d\'un format, « Annuler »', async () => {
    const dialog = await formatAction(page, ctx, article, 'delete');
    await button(dialog, msg(ctx.locale, 'articles.sheet.cancel')).click();
  });
}

async function checkAddFormat(page, ctx) {
  const { locale } = ctx;
  await step(page, ctx, 'Ajouter un format : liste « Unité » ouverte, option choisie, clic à l\'extérieur', async () => {
    const dialog = await openAddFormat(page, ctx);
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option').nth(1).click();
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
    await clickOutside(page, ctx);
  });
  await step(page, ctx, 'Ajouter un format, retour arrière pendant que la fenêtre est ouverte', async () => {
    await openAddFormat(page, ctx);
    await page.goBack();
    await page.waitForLoadState('networkidle');
  });
  await page.goForward();
  await page.waitForLoadState('networkidle');
  await step(page, ctx, 'format enregistré, notification affichée', async () => {
    const dialog = await openAddFormat(page, ctx);
    formats += 1;
    await dialog.getByRole('textbox', { name: fmt(locale, 'articles.sheet.format.name', { type: 'product' }), exact: true }).fill(`Défilement ${formats}`);
    await dialog.getByRole('textbox', { name: msg(locale, 'articles.form.selling_price'), exact: true }).fill('9');
    await dialog.locator('button[type=submit]').click();
    await page.locator('[data-sonner-toast]').first().waitFor();
  });
}

async function checkCrop(page, ctx, article) {
  await goto(page, `/products/${article.id}/edit`);
  const image = await makeImage(page, 800, 600);
  // Mobile : la carte « Photo » est repliée ; on l'ouvre comme le ferait l'utilisateur.
  await openCard(page, ctx, msg(ctx.locale, 'articles.form.section_photo'));
  await step(page, ctx, 'recadrage d\'une photo, « Annuler »', async () => {
    await page.locator('input[type=file]').first().setInputFiles(image);
    const dialog = page.getByRole('dialog', { name: msg(ctx.locale, 'ui.crop.title') });
    await dialog.waitFor();
    await button(dialog, msg(ctx.locale, 'ui.crop.cancel')).click();
  });
}

/** Filtres de la liste : menu (desktop) ou fenêtre du bas (mobile). */
async function checkFilters(page, ctx) {
  await goto(page, '/products');
  if (ctx.viewport.mobile) {
    await step(page, ctx, 'filtres de la liste (fenêtre du bas), clic à l\'extérieur', async () => {
      await button(page, msg(ctx.locale, 'ui.list.filters')).click();
      await page.getByRole('dialog').first().waitFor();
      await clickOutside(page, ctx);
    });
    return;
  }
  const trigger = page.locator('main button[aria-haspopup=menu]').first();
  await step(page, ctx, 'filtre de la liste (menu), option choisie', async () => {
    await trigger.click();
    await page.getByRole('menuitemradio').nth(1).click();
  });
  await step(page, ctx, 'filtre de la liste (menu), Échap', async () => {
    await trigger.click();
    await page.getByRole('menu').waitFor();
    await page.keyboard.press('Escape');
  });
}

/** Apparence : depuis le menu du compte (desktop) ou le menu burger (mobile), fermée par « Fermer ». */
async function checkAccountMenus(page, ctx) {
  const { locale, viewport } = ctx;
  const open = viewport.mobile
    ? () => button(page, msg(locale, 'layout.common.menu')).click()
    : () => page.locator('aside button[aria-haspopup=menu]').filter({ visible: true }).first().click();
  const appearance = viewport.mobile
    ? () => button(page.getByRole('dialog', { name: msg(locale, 'layout.common.menu') }), msg(locale, 'layout.common.appearance')).click()
    : () => page.getByRole('menuitem').filter({ hasText: msg(locale, 'layout.common.appearance') }).click();
  const menu = viewport.mobile ? 'menu burger' : 'menu du compte';
  await step(page, ctx, `${menu} ouvert, clic à l'extérieur`, async () => {
    await open();
    await page.waitForTimeout(400);
    // Le menu burger s'ouvre du côté du début de ligne (à droite en arabe) : clic de l'autre côté.
    const side = locale === 'ar' ? 8 : viewport.width - 8;
    await page.mouse.click(viewport.mobile ? side : viewport.width / 2, viewport.height / 2);
  });
  await step(page, ctx, `« Apparence » depuis le ${menu}, fermée par « Fermer »`, async () => {
    await open();
    await appearance();
    const drawer = page.getByRole('dialog', { name: msg(locale, 'layout.themeDrawer.title') });
    await drawer.waitFor();
    await page.waitForTimeout(400);
    await button(drawer, msg(locale, 'layout.common.close')).click();
  });
}

async function run(page, ctx, article) {
  await goto(page, '/products');
  await goto(page, `/products/${article.id}`);
  await checkPageMenu(page, ctx);
  await checkFormatWindows(page, ctx, article);
  await checkAddFormat(page, ctx);
  await checkCrop(page, ctx, article);
  await checkFilters(page, ctx);
  await checkAccountMenus(page, ctx);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const article = await createArticle(page, { name: `Audit défilement ${Date.now()}`, price: '5.00', stock: 2 });
  // « Lot » sans stock, jamais utilisé : son menu « ⋯ » propose « Supprimer ».
  await api(page, `products/${article.id}/variants/`, {
    method: 'POST', data: { packaging_name: 'Lot', base_quantity: '1', unit: 'piece', selling_price: '5.00' },
  });
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      await run(page, { label, locale, viewport }, article);
      const problems = watch.problems.slice(before);
      report.check(problems.length === 0, `${label} : console propre, défilement jamais bloqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await deactivate(page, [article.id]);
  await ctx.close();
}
await browser.close();
report.finish();
