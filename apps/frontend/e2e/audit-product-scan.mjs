/**
 * Audit du scan d'emballage (URS-109) dans le formulaire de création d'article, à 1440px et 360px
 * (matrice smoke : fr clair, ar sombre). L'endpoint `/api/ocr/product-scan` est simulé
 * (`page.route`) : aucune photo ne part vers le backend ni vers un fournisseur.
 * - encadré « Scanner l'emballage » en tête du formulaire, bouton de 44px au moins ; absent pour un
 *   service et en modification ;
 * - lecture en cours : squelette ; puis pré-remplissage des seuls champs vides (le nom déjà saisi
 *   reste intact), badge « Détecté, à vérifier » sur la description et le code-barres, carte
 *   Référence ouverte, avertissement du quota de lecture avancée, prix jamais pré-rempli ;
 * - le badge disparaît dès que la description est corrigée ; l'article créé porte la description
 *   corrigée et le code-barres lu (relus dans l'API) ;
 * - erreur réseau : alerte et « Réessayer », qui relance la même photo et pré-remplit le nom
 *   composé par le serveur quand il est vide ;
 * - « Ajouter le dos » : face et dos renvoyés ensemble, le nom encore égal à la détection est
 *   rafraîchi (contenance lue au dos), la description corrigée entre-temps reste intacte.
 * Les articles créés sont supprimés à la fin (ils n'ont jamais servi).
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, remove } from './lib/products.mjs';
import { makeImage } from './lib/photos.mjs';
import { cardToggle, textbox, visibleButton } from './lib/form.mjs';
import { nestedInteractive } from './lib/watch.mjs';

const report = createReport();
const SCAN_URL = '**/api/ocr/product-scan';
const field = (value, source, confidence = 0.9) => ({ value, confidence, source });

/**
 * Réponse simulée du scan : `barcode` change à chaque passage (code-barres unique dans la boutique).
 * Le nom est composé par le serveur ; sans `quantity`, la contenance n'a pas été lue (face seule).
 */
const scanResponse = (barcode, { quantity = true } = {}) => ({
  fields: {
    name: field(quantity ? 'Lactel Lait demi-écrémé 1 L' : 'Lactel Lait demi-écrémé', 'open_food_facts'),
    brand: field('Lactel', 'open_food_facts'),
    product_name: field('Lait demi-écrémé', 'open_food_facts'),
    variant: null,
    net_quantity: quantity ? field('1 L', 'ocr', 0.8) : null,
    unit_suggestion: field('piece', 'ocr', 0.6),
    barcode: field(barcode, 'barcode', 1),
    description: field('Lait UHT, sans conservateur', 'ocr', 0.7),
  },
  warnings: ['vision_quota_reached'],
});

async function goto(page, path, nested) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

const scanInput = (page) => page.locator('form input[type=file][capture]').first();
const scanInputs = (page) => page.locator('form input[type=file][capture]');
const badges = (page, t) => page.getByText(t('articles.scan.detected'), { exact: true }).filter({ visible: true });
/** Encadré de scan : premier enfant du formulaire. */
const scanCard = (page) => page.locator('form > :first-child');
const scanStatus = (page) => scanCard(page).locator('[role=status]:not([aria-busy])');

/**
 * Simule l'endpoint : réponse après `delay` ms (squelette visible), ou panne réseau. Renvoie la
 * liste des envois reçus (`back` : la photo du dos était jointe).
 */
async function mockScan(page, { barcode, fail = false, delay = 600, quantity = true }) {
  const sent = [];
  await page.unroute(SCAN_URL);
  await page.route(SCAN_URL, async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    sent.push({ face: body.includes('name="image"'), back: body.includes('name="image_back"') });
    if (fail) return route.abort('connectionfailed');
    await new Promise((resolve) => { setTimeout(resolve, delay); });
    return route.fulfill({ status: 200, json: scanResponse(barcode, { quantity }) });
  });
  return sent;
}

/** Choix du type : le bouton radio est masqué (`sr-only`), on clique sur son libellé. */
const chooseType = (page, name) => page.locator('label').filter({ has: page.getByRole('radio', { name: new RegExp(`^${name}`) }) }).click();

/** Encadré en tête du formulaire, bouton assez grand ; absent pour un service. */
async function checkEntry(page, t, ctx) {
  const button = scanCard(page).locator('label').filter({ has: page.locator('input[capture]') });
  const box = await button.boundingBox();
  const first = (await scanCard(page).locator('input[capture]').count()) === 1;
  await chooseType(page, t('articles.form.type_service'));
  const hiddenForService = (await scanInputs(page).count()) === 0;
  await chooseType(page, t('articles.form.type_product'));
  const state = { first, tap: Boolean(box) && box.height >= 44, text: (await button.innerText()).includes(t('articles.scan.scan')),
    hiddenForService, back: (await scanInputs(page).count()) === 1 };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : « ${t('articles.scan.scan')} » en tête du formulaire, bouton ≥ 44px, absent pour un service ${JSON.stringify(state)}`);
}

/** Photo envoyée : squelette pendant la lecture, puis message de fin (`filled` champs). */
async function scan(page, photo) {
  await scanInput(page).setInputFiles(photo);
  const skeleton = await page.locator('form [data-skeleton]').waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false);
  await page.locator('form [data-skeleton]').waitFor({ state: 'detached', timeout: 8000 });
  return skeleton;
}

async function prefillAndCreate(page, t, ctx, photo, nested) {
  const { label, locale } = ctx;
  const f = (key, values) => fmt(locale, `articles.form.${key}`, values);
  await goto(page, '/products/new', nested);
  await checkEntry(page, t, ctx);
  const typed = `Audit scan ${Date.now()}`;
  await textbox(page, t('articles.form.name')).fill(typed);
  const code = String(Date.now()).slice(-13);
  await mockScan(page, { barcode: code });
  const skeleton = await scan(page, photo);

  const mocked = scanResponse(code).fields;
  const status = await scanStatus(page).innerText();
  const reference = !ctx.viewport.mobile || (await cardToggle(page, t('articles.form.section_reference')).getAttribute('aria-expanded')) === 'true';
  const state = { skeleton, reference,
    name: (await textbox(page, t('articles.form.name')).inputValue()) === typed,
    description: (await textbox(page, t('articles.form.description')).inputValue()) === mocked.description.value,
    barcode: (await textbox(page, t('articles.form.barcode')).inputValue()) === code,
    price: (await textbox(page, t('articles.form.selling_price')).inputValue()) === '',
    badges: (await badges(page, t).count()) === 2,
    message: status.includes(fmt(locale, 'articles.scan.filled', { count: 2 })),
    warning: status.includes(t('articles.scan.warning.vision_quota_reached')) };
  report.check(Object.values(state).every(Boolean),
    `${label} : squelette, puis description et code-barres pré-remplis avec « ${t('articles.scan.detected')} », nom saisi intact, prix vide, avertissement du quota ${JSON.stringify(state)}`);

  const corrected = 'Lait UHT demi-écrémé (audit, corrigé)';
  await textbox(page, t('articles.form.description')).fill(corrected);
  const left = await badges(page, t).count();
  await textbox(page, t('articles.form.selling_price')).fill('2');
  await visibleButton(page, f('submit_create', { type: 'product' })).click();
  await page.waitForURL(/\/products\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  const saved = await api(page, `products/${id}/`);
  const saveState = { badge: left === 1, name: saved.name === typed, description: saved.description === corrected,
    barcode: saved.variants[0].barcode === code, price: Number(saved.variants[0].selling_price) === 2 };
  report.check(Object.values(saveState).every(Boolean),
    `${label} : badge retiré à la correction ; article créé avec la description corrigée et le code-barres lu ${JSON.stringify(saveState)}`);
  return id;
}

/** Panne réseau : alerte et « Réessayer », qui relance la même photo. Pas d'encadré en modification. */
async function networkError(page, t, ctx, photo, id, nested) {
  await goto(page, `/products/${id}/edit`, nested);
  const absentInEdit = (await scanInputs(page).count()) === 0;
  await goto(page, '/products/new', nested);
  await mockScan(page, { fail: true });
  await scan(page, photo);
  const alert = scanCard(page).locator('[role=alert]').filter({ hasText: t('articles.scan.error.unavailable') });
  const retry = visibleButton(page, t('articles.scan.retry'));
  const failed = { alert: (await alert.count()) === 1, retry: (await retry.count()) === 1,
    tap: ((await retry.boundingBox())?.height ?? 0) >= 44 };

  const code = String(Date.now()).slice(-13);
  await mockScan(page, { barcode: code, quantity: false });
  await retry.click();
  await page.locator('form [data-skeleton]').waitFor({ state: 'detached', timeout: 8000 });
  const status = await scanStatus(page).innerText();
  const state = { absentInEdit, ...failed, cleared: (await alert.count()) === 0,
    name: (await textbox(page, t('articles.form.name')).inputValue()) === 'Lactel Lait demi-écrémé',
    message: status.includes(fmt(ctx.locale, 'articles.scan.filled', { count: 3 })), badges: (await badges(page, t).count()) === 3 };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : absent en modification ; panne réseau → « ${t('articles.scan.error.unavailable')} » et « ${t('articles.scan.retry')} » (≥ 44px), puis nom, description et code-barres pré-remplis ${JSON.stringify(state)}`);
  await addBack(page, t, ctx, photo, code);
  await page.unroute(SCAN_URL);
}

/** « Ajouter le dos » : face et dos envoyés ensemble ; le nom détecté est rafraîchi, la saisie gardée. */
async function addBack(page, t, ctx, photo, code) {
  const corrected = 'Lait UHT (audit, corrigé)';
  await textbox(page, t('articles.form.description')).fill(corrected);
  const button = scanCard(page).locator('label').filter({ hasText: t('articles.scan.add_back') });
  const hint = scanCard(page).getByText(t('articles.scan.back_hint'), { exact: true });
  const offered = { hint: await hint.isVisible(), tap: ((await button.boundingBox())?.height ?? 0) >= 44 };
  const sent = await mockScan(page, { barcode: code });
  await scanInputs(page).nth(1).setInputFiles(photo);
  await page.locator('form [data-skeleton]').waitFor({ state: 'detached', timeout: 8000 });
  const status = await scanStatus(page).innerText();
  const state = { ...offered, sent: sent.length === 1 && sent[0].face && sent[0].back,
    name: (await textbox(page, t('articles.form.name')).inputValue()) === 'Lactel Lait demi-écrémé 1 L',
    description: (await textbox(page, t('articles.form.description')).inputValue()) === corrected,
    message: status.includes(fmt(ctx.locale, 'articles.scan.filled', { count: 1 })),
    once: (await hint.count()) === 0 && (await scanInputs(page).count()) === 1 };
  report.check(Object.values(state).every(Boolean),
    `${ctx.label} : « ${t('articles.scan.add_back')} » (≥ 44px) renvoie face et dos ; nom détecté rafraîchi, description corrigée intacte ${JSON.stringify(state)}`);
}

async function run(page, t, ctx, photo, created, nested) {
  try {
    const id = await prefillAndCreate(page, t, ctx, photo, nested);
    created.push(id);
    await networkError(page, t, ctx, photo, id, nested);
  } catch (error) {
    report.check(false, `${ctx.label} : parcours interrompu — ${error.message.split('\n').slice(0, process.env.DEBUG ? 6 : 1).join('\n')}`);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/scan-${ctx.viewport.name}-${ctx.locale}-${ctx.theme}.png`, fullPage: true });
  }
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const photo = await makeImage(page, 800, 600);
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
        await run(page, (key) => msg(locale, key), { label, viewport, locale, theme }, photo, created, nested);
        // La panne réseau simulée est attendue ; tout autre message de console compte.
        const problems = [...watch.problems.slice(before).filter((p) => !p.includes('/api/ocr/product-scan')), ...nested.map((n) => `imbriqué : ${n}`)];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    await remove(page, created);
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
