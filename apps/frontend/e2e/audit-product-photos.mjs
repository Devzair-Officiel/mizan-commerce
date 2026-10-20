/**
 * Audit des photos d'articles au format carré, à 1440px et 360px, en clair et en sombre, en
 * français et en arabe : des photos très hautes (300×1200) et très larges (1200×300), envoyées
 * sans recadrage par l'API comme des photos anciennes, apparaissent recadrées en carré
 * (`object-cover` dans un cadre `aspect-square`, fond `bg-muted`) dans la liste des articles, sur
 * la fiche (photo principale et miniatures) et dans le catalogue de la nouvelle commande.
 * Les deux articles (« Audit photo haute », « Audit photo large ») sont créés une fois, réactivés
 * au début et désactivés à la fin.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { allResults, api, createArticle, deactivate } from './lib/products.mjs';
import { makeImage, squarePhotos, tallAndWideSquare, uploadImage } from './lib/photos.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const SEARCH = 'Audit photo';
const visible = (locator) => locator.filter({ visible: true });

async function goto(page, path, nested) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** « Audit photo haute » (haute puis large) et « Audit photo large » (large) : créés une fois, réactivés ensuite. */
async function ensureFixtures(page) {
  const existing = await allResults(page, `products/?state=all&search=${encodeURIComponent(SEARCH)}`);
  const tall = await makeImage(page, 300, 1200);
  const wide = await makeImage(page, 1200, 300);
  const specs = [{ name: `${SEARCH} haute`, files: [tall, wide] }, { name: `${SEARCH} large`, files: [wide] }];
  const out = [];
  for (const { name, files } of specs) {
    let product = existing.find((p) => p.name === name);
    if (product && !product.is_active) await api(page, `products/${product.id}/reactivate/`, { method: 'POST' });
    product ??= await createArticle(page, { name, price: '7.00', stock: 5 });
    if ((await api(page, `products/${product.id}/`)).images.length === 0) {
      for (const file of files) await uploadImage(page, product.id, file);
    }
    // Chaque envoi devient la photo principale : la première envoyée (haute) le redevient.
    const [first] = (await api(page, `products/${product.id}/`)).images.sort((a, b) => a.position - b.position);
    await api(page, `products/${product.id}/images/${first.id}/`, { method: 'PATCH', data: { is_primary: true } });
    out.push(product);
  }
  return out;
}

const describe = (photos) => photos.map((p) => `${p.ratio.toFixed(2)}${p.square ? '' : ' non carré'}${p.fills && p.cover ? '' : ' non recadré'}`).join(', ');

async function checkList(page, ctx, nested) {
  await goto(page, '/products', nested);
  await visible(page.getByPlaceholder(fmt(ctx.locale, 'articles.list.search_placeholder', { kind: 'both' }))).first().fill(SEARCH);
  await page.waitForLoadState('networkidle');
  await visible(page.getByText(`${SEARCH} large`, { exact: true })).first().waitFor();
  const photos = await squarePhotos(page.locator('main'));
  report.check(tallAndWideSquare(photos), `${ctx.label} : liste — photos haute et large en carré (${describe(photos)})`);
}

async function checkSheet(page, ctx, product, nested) {
  await goto(page, `/products/${product.id}`, nested);
  const card = page.getByRole('region', { name: msg(ctx.locale, 'articles.sheet.photos') });
  const photos = await squarePhotos(card);
  const manage = card.getByRole('link', { name: msg(ctx.locale, 'articles.sheet.photos_manage') });
  report.check(photos.length === 3 && tallAndWideSquare(photos) && (await manage.getAttribute('href')) === `/products/${product.id}/edit?focus=photos`,
    `${ctx.label} : fiche — photo principale et deux miniatures en carré, « ${msg(ctx.locale, 'articles.sheet.photos_manage')} » (${describe(photos)})`);
}

async function checkCatalog(page, ctx, nested) {
  await goto(page, '/orders/new', nested);
  if (ctx.viewport.mobile) {
    await visible(page.getByRole('button', { name: fmt(ctx.locale, 'orders.picker.product_trigger_title', { kind: 'both' }), exact: true })).first().click();
  }
  await visible(page.locator('input[inputmode=search]')).first().fill(SEARCH);
  await page.waitForLoadState('networkidle');
  const scope = ctx.viewport.mobile ? page.getByRole('dialog') : page.locator('main');
  await visible(scope.getByText(`${SEARCH} large`, { exact: true })).first().waitFor();
  const photos = await squarePhotos(scope);
  report.check(tallAndWideSquare(photos), `${ctx.label} : catalogue de la nouvelle commande — photos haute et large en carré (${describe(photos)})`);
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const fixtures = await ensureFixtures(page);
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
        const run = { label, viewport, locale };
        try {
          await checkList(page, run, nested);
          await checkSheet(page, run, fixtures[0], nested);
          await checkCatalog(page, run, nested);
        } catch (error) {
          report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
          if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/photos-${viewport.name}-${locale}-${theme}.png`, fullPage: true });
        }
        const problems = [...watch.problems.slice(before), ...nested.map((n) => `imbriqué : ${n}`)];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    await deactivate(page, fixtures.map((p) => p.id));
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
