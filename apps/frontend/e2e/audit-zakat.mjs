/**
 * Audit de la zakat (Z2a) : accueil, réglages et assistant, dans la boutique du compte d'audit.
 * Profil et fiches passent par l'API ; chaque configuration repart sans fiche.
 *  - accueil : jour J et anneau, une seule action « Préparer », la fiche n'existe qu'après le clic ;
 *  - réglages : le prix du gramme part au serveur sans bouton « Enregistrer » ;
 *  - choix manquant : « Continuer » désactivé tant que le choix de l'étape n'est pas fait ;
 *  - sous le seuil : l'écran Résultat dit « Pas de zakat » ;
 *  - conflit de version : la fiche modifiée ailleurs est rechargée, la personne prévenue ;
 *  - année déjà prise : un jour J dans une année déjà calculée est signalé, avec le lien vers l'autre fiche.
 * Partout : console propre, aucun défilement horizontal. Les fiches sont supprimées à la fin.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { visibleButton } from './lib/form.mjs';
import { api } from './lib/products.mjs';

const report = createReport();
const CALCS = 'zakat/calculations/';
/** Choix complets ; le prix du gramme met le seuil (595 g × 1 000) bien au-dessus de la boutique d'audit. */
const CHOICES = {
  calendar: 'hijri', nisab_method: 'silver', nisab_unit_price: '1000.00',
  stock_valuation: 'purchase', receivables_mode: 'yearly', debts_mode: 'all',
};
const DAY_MS = 86_400_000;
/** Jours d'écart : chaque fiche tombe dans sa propre année hégirienne (354 jours). */
const isoDay = (offset) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
const timeout = 5000;
const appears = (locator) => locator.first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function clearCalculations(page) {
  for (const calc of (await api(page, CALCS)).results) await api(page, `${CALCS}${calc.id}/`, { method: 'DELETE' });
}

const createCalc = (page, data) => api(page, CALCS, { method: 'POST', data: { choices: CHOICES, ...data } });

/** Accueil sans fiche : jour J, anneau, une seule action ; le clic crée la fiche et ouvre l'étape 1. */
async function checkHome(page, locale, label) {
  const profile = await api(page, 'zakat/profile/', { method: 'PATCH', data: { hawl_date: isoDay(30), ...CHOICES } });
  await page.goto(`${BASE}/zakat`);
  await page.getByRole('heading', { name: msg(locale, 'zakat.home.next_label'), exact: true }).waitFor();
  const ring = await page.locator('[aria-labelledby="zakat-next-hawl"] [role="img"]').isVisible();
  const start = visibleButton(page, fmt(locale, 'zakat.home.start_year', { year: String(profile.next_hawl.hawl_year) }));
  const single = await start.count() === 1;
  const empty = await page.getByText(msg(locale, 'zakat.home.history_empty'), { exact: true }).isVisible();
  const none = (await api(page, CALCS)).count === 0;
  report.check(ring && single && empty && none && await noOverflow(page),
    `${label} : accueil — jour J, anneau, une seule action, historique vide, aucune fiche avant le clic, sans débordement`);
  await start.click();
  const opened = await page.waitForURL(/\/zakat\/[0-9a-f-]{36}\?etape=1$/, { timeout }).then(() => true, () => false);
  report.check(opened && (await api(page, CALCS)).count === 1, `${label} : « Préparer » crée la fiche et ouvre l'étape 1`);
}

/** Réglages : le prix du gramme s'enregistre seul, sans bouton. */
async function checkSettings(page, locale, label) {
  await page.goto(`${BASE}/zakat/reglages`);
  const field = page.getByRole('textbox', { name: fmt(locale, 'zakat.steps.hawl.price_label', { metal: 'silver' }), exact: true });
  await field.waitFor();
  // Réponse finale : le proxy redirige d'abord l'adresse à barre oblique finale (308).
  const saved = page.waitForResponse((r) => r.url().includes('/zakat/profile') && r.request().method() === 'PATCH' && r.status() === 200, { timeout });
  await field.fill(locale === 'fr' ? '0,85' : '0.85');
  const body = await saved.then((r) => r.json(), () => null);
  const noButton = await visibleButton(page, msg(locale, 'zakat.common.save')).count() === 0;
  report.check(Number(body?.nisab_unit_price) === 0.85 && noButton && await noOverflow(page),
    `${label} : réglages — prix du gramme enregistré sans bouton, sans débordement`);
  await api(page, 'zakat/profile/', { method: 'PATCH', data: { nisab_unit_price: CHOICES.nisab_unit_price } });
}

/**
 * Choix manquant (profil jamais réglé) : la première lecture de la fiche est servie sans métal de
 * référence, comme pour une première zakat ; le geste enregistre le choix et débloque « Continuer ».
 */
async function checkMissingChoice(page, ctx, viewport, locale, label) {
  const calc = await createCalc(page, { reference_date: isoDay(-400) });
  const pattern = new RegExp(`/api/proxy/${CALCS}${calc.id}/?$`);
  let served = false;
  await ctx.route(pattern, async (route) => {
    if (route.request().method() !== 'GET' || served) return route.continue();
    served = true;
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: { ...json, choices: { ...json.choices, nisab_method: null } } });
  });
  await page.goto(`${BASE}/zakat/${calc.id}?etape=1`);
  const choose = visibleButton(page, msg(locale, 'zakat.wizard.choose'));
  const blocked = await appears(choose) && await choose.isDisabled();
  const question = msg(locale, 'zakat.choice.nisab_method.question');
  await page.getByRole('radiogroup', { name: question, exact: true }).filter({ visible: true })
    .getByRole('radio').filter({ hasText: msg(locale, 'zakat.choice.nisab_method.gold.title') }).click();
  const next = visibleButton(page, msg(locale, 'zakat.wizard.next'));
  const unblocked = await appears(next) && await next.isEnabled();
  await ctx.unroute(pattern);
  report.check(blocked && unblocked && await noOverflow(page),
    `${label} : choix manquant — « Continuer » désactivé, puis actif une fois le choix fait`);
  if (viewport.mobile) {
    await page.getByRole('button', { name: msg(locale, 'zakat.wizard.progress_label'), exact: true }).click();
    const sheet = page.getByRole('dialog').filter({ hasText: msg(locale, 'zakat.wizard.menu_title') });
    const shown = await appears(sheet);
    await page.keyboard.press('Escape');
    report.check(shown && await sheet.waitFor({ state: 'hidden', timeout }).then(() => true, () => false),
      `${label} : « Étape 1 sur 7 » ouvre puis ferme la liste des étapes`);
  }
}

/** Sous le seuil : l'écran Résultat le dit, sans montant de zakat. */
async function checkBelow(page, locale, label) {
  const calc = await createCalc(page, { reference_date: isoDay(-800), cash_amount: '10.00', current_step: 6 });
  await page.goto(`${BASE}/zakat/${calc.id}?etape=7`);
  const verdict = page.getByText(msg(locale, 'zakat.result.below_title'), { exact: true }).filter({ visible: true });
  report.check(calc.totals.status === 'below_nisab' && await appears(verdict) && await noOverflow(page),
    `${label} : sous le seuil — « ${msg(locale, 'zakat.result.below_title')} »`);
}

/** Conflit de version : la fiche change ailleurs, la saisie suivante est refusée, la fiche rechargée. */
async function checkConflict(page, locale, label) {
  const calc = await createCalc(page, { reference_date: isoDay(-1200), current_step: 1 });
  await page.goto(`${BASE}/zakat/${calc.id}?etape=2`);
  const field = page.getByRole('textbox', { name: msg(locale, 'zakat.steps.cash.label'), exact: true });
  await field.waitFor();
  await api(page, `${CALCS}${calc.id}/`, { method: 'PATCH', data: { version: calc.version, cash_amount: '777.00' } });
  await field.fill('123');
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: msg(locale, 'zakat.common.conflict') });
  const warned = await appears(toast);
  // Le rechargement remonte le champ : relu par son locator, pas par l'élément d'avant.
  let reloaded = false;
  for (const end = Date.now() + timeout; !reloaded && Date.now() < end; await page.waitForTimeout(100)) {
    reloaded = /^777[.,]00$/.test(await field.inputValue().catch(() => ''));
  }
  report.check(warned && reloaded, `${label} : conflit de version — notification${warned ? '' : ' absente'}, fiche rechargée (777)${reloaded ? '' : ' : non'}`);
}

/** Année déjà prise : le jour J d'une autre fiche est refusé, l'alerte mène à cette fiche. */
async function checkYearTaken(page, locale, label) {
  const other = await createCalc(page, { reference_date: isoDay(-2000) });
  const calc = await createCalc(page, { reference_date: isoDay(-1600) });
  await page.goto(`${BASE}/zakat/${calc.id}?etape=1`);
  await page.locator('input[type="date"]').filter({ visible: true }).fill(other.reference_date);
  const alert = page.getByRole('alert').filter({ hasText: fmt(locale, 'zakat.common.year_taken', { year: String(other.hawl_year) }) });
  const shown = await appears(alert);
  const href = shown ? await alert.getByRole('link', { name: msg(locale, 'zakat.common.year_taken_open'), exact: true }).getAttribute('href') : null;
  report.check(href === `/zakat/${other.id}`, `${label} : année déjà prise — alerte et lien vers la fiche de ${other.hawl_year}`);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      if (!inMatrix(viewport, locale, theme)) continue;
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      await clearCalculations(page);
      await checkHome(page, locale, label);
      await checkSettings(page, locale, label);
      await checkMissingChoice(page, ctx, viewport, locale, label);
      await checkBelow(page, locale, label);
      await checkConflict(page, locale, label);
      await checkYearTaken(page, locale, label);
      // Les 409 (version, année) sont provoqués par l'audit lui-même.
      const problems = watch.problems.slice(before).filter((p) => !/status of 409 .*\/zakat\/calculations\//.test(p));
      report.check(problems.length === 0, `${label} : console propre${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await clearCalculations(page);
  await ctx.close();
}
await browser.close();
report.finish();
