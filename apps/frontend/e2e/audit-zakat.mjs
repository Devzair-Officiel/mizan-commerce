/**
 * Audit de la zakat (Z2a, Z2b) : accueil, réglages et assistant, dans la boutique du compte d'audit.
 * Profil et fiches passent par l'API ; chaque configuration repart sans fiche.
 *  - accueil : jour J et anneau, une seule action « Préparer », la fiche n'existe qu'après le clic ;
 *  - réglages : le prix du gramme part au serveur sans bouton « Enregistrer » ;
 *  - choix manquant : « Continuer » désactivé tant que le choix de l'étape n'est pas fait ;
 *  - sous le seuil : l'écran Résultat dit « Pas de zakat » ;
 *  - conflit de version : la fiche modifiée ailleurs est rechargée, la personne prévenue ;
 *  - année déjà prise : un jour J dans une année déjà calculée est signalé, avec le lien vers l'autre fiche ;
 *  - justificatif : téléchargé depuis le Résultat et depuis l'accueil (`zakat-{année}.pdf`) ;
 *  - fiches Fondement : ouvertes depuis le Résultat (huit catégories), un choix (« Votre choix »), les repères
 *    des autres biens (sur mobile, la feuille des repères se ferme d'abord), et l'accueil au clavier :
 *    tiroir de 440 px côté fin (à gauche en arabe) ou feuille du bas, focus piégé, liste → fiche → liste,
 *    Échap ferme et rend le focus ;
 *  - versement (Z4) : « Marquer comme versée » avec la date et le montant proposés, « Versée le … » au Résultat
 *    et dans l'historique, « Revenir » ;
 *  - lignes personnelles (Z4) : part sous 100 %, pastille « Personnelle » et note de part ; dans la feuille d'une
 *    dette, « Boutique / Personnelle » sans rien de coché, obligatoire ;
 *  - suivi à l'encaissement (Z4) : rien sur l'accueil tant que rien n'est encaissé ; « Encaissée », « Marquer
 *    comme versée » (une seule fois), choix D4 sans option cochée, puis la carte « À verser » de l'accueil.
 * Partout : console propre, aucun défilement horizontal. Les fiches sont supprimées à la fin.
 */
import { readFile } from 'node:fs/promises';
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { visibleButton } from './lib/form.mjs';
import { api } from './lib/products.mjs';
import { focusReached } from './lib/wait.mjs';

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

/** Lien du justificatif cliqué : nom du fichier reçu, et s'il s'agit bien d'un PDF. */
async function downloadPdf(page, link) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), link.click()]);
  const head = (await readFile(await download.path())).subarray(0, 5).toString();
  return { name: download.suggestedFilename(), pdf: head === '%PDF-' };
}

const visibleLink = (page, name) => page.getByRole('link', { name, exact: true }).filter({ visible: true });
const basisDialog = (page, locale, key) => page.getByRole('dialog', { name: msg(locale, `zakat.basis.${key}`), exact: true });
const closed = (dialog) => dialog.waitFor({ state: 'hidden', timeout }).then(() => true, () => false);
const focusInside = (dialog) => dialog.evaluate((el) => el.contains(document.activeElement));
/** Rien ne déborde en largeur dans le panneau (badges, références, avis). */
const fitsWidth = (dialog) => dialog.evaluate((el) => [...el.querySelectorAll('div')].every((d) => d.scrollWidth <= d.clientWidth + 1));
/** Lignes du panneau qui contiennent tous ces textes. */
const rowsWith = (dialog, ...texts) => texts.reduce((rows, text) => rows.filter({ hasText: text }), dialog.getByRole('listitem')).count();

/** Panneau arrivé contre son bord (2 s au plus) : bord de fin sur desktop (droite, gauche en arabe), bas sur mobile. */
function docked(dialog, mobile) {
  return dialog.evaluate((el, onMobile) => new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      const r = el.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const ok = onMobile
        ? Math.abs(r.bottom - window.innerHeight) < 2 && r.left < 2 && Math.abs(r.right - width) < 2
        : Math.abs(r.width - 440) < 2 && (rtl ? Math.abs(r.left) < 2 : Math.abs(r.right - width) < 2);
      if (ok || Date.now() - start > 2000) resolve(ok);
      else requestAnimationFrame(poll);
    };
    poll();
  }), mobile);
}

/** Tab fait le tour du panneau et revient au premier élément sans en sortir ; Maj+Tab y reste aussi. */
async function tabTrapped(page, dialog) {
  const count = await dialog.evaluate((el) => {
    document.activeElement?.setAttribute('data-audit-start', '');
    return [...el.querySelectorAll('a[href], button:not([disabled])')].filter((n) => n.offsetParent !== null).length;
  });
  let inside = true;
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    inside &&= await focusInside(dialog);
  }
  const looped = await dialog.evaluate(() => document.activeElement?.hasAttribute('data-audit-start') ?? false);
  await page.keyboard.press('Shift+Tab');
  inside &&= await focusInside(dialog);
  return count > 1 && inside && looped;
}

/** Résultat d'une zakat due : justificatif téléchargé, « Voir les huit catégories » ouvre la fiche des bénéficiaires. */
async function checkResult(page, viewport, locale, label) {
  const calc = await createCalc(page, { reference_date: isoDay(-2400), cash_amount: '700000.00', current_step: 6 });
  await page.goto(`${BASE}/zakat/${calc.id}?etape=7`);
  const link = visibleLink(page, msg(locale, viewport.mobile ? 'zakat.result.pdf_short' : 'zakat.result.pdf'));
  const file = await appears(link) ? await downloadPdf(page, link) : null;
  report.check(calc.totals.status === 'above_nisab' && file?.pdf && file.name === `zakat-${calc.hawl_year}.pdf`,
    `${label} : Résultat — justificatif téléchargé (${file?.name ?? 'aucun fichier'})`);
  const see = msg(locale, 'zakat.basis.see_categories');
  const trigger = visibleButton(page, see);
  await trigger.click();
  const sheet = basisDialog(page, locale, 'topic.recipients.title');
  const categories = await appears(sheet) ? await sheet.locator('ol > li').count() : 0;
  await page.keyboard.press('Escape');
  report.check(categories === 8 && await closed(sheet) && await focusReached(trigger),
    `${label} : « ${see} » — fiche des bénéficiaires, ${categories} catégories sur 8, Échap rend le focus`);
  return calc;
}

/** Jour J : « Sur quoi reposent ces avis ? » ouvre la fiche du seuil, « Votre choix » sur l'argent seul. */
async function checkWhy(page, locale, label, calc) {
  await page.goto(`${BASE}/zakat/${calc.id}?etape=1`);
  const why = msg(locale, 'zakat.basis.why');
  await visibleButton(page, why).first().click();
  const sheet = basisDialog(page, locale, 'topic.nisab.title');
  const yours = msg(locale, 'zakat.basis.your_choice');
  const marked = await appears(sheet) && await rowsWith(sheet, yours) === 1
    && await rowsWith(sheet, yours, msg(locale, 'zakat.choice.nisab_method.silver.title')) === 1;
  await page.keyboard.press('Escape');
  report.check(marked && await closed(sheet), `${label} : « ${why} » — fiche du seuil, « ${yours} » sur l'argent seulement`);
}

/** Autres biens : « Voir les sources » ouvre la fiche ; sur mobile depuis la feuille des repères, qui se ferme d'abord. */
async function checkOtherSources(page, viewport, locale, label, calc) {
  await page.goto(`${BASE}/zakat/${calc.id}?etape=5`);
  const see = msg(locale, 'zakat.basis.see_sources');
  const trigger = visibleButton(page, viewport.mobile ? msg(locale, 'zakat.steps.other.markers_link') : see);
  await trigger.click();
  if (viewport.mobile) {
    const markers = page.getByRole('dialog', { name: msg(locale, 'zakat.steps.other.markers_title'), exact: true });
    await markers.getByRole('button', { name: see, exact: true }).click();
  }
  const sheet = basisDialog(page, locale, 'topic.other.title');
  const alone = await appears(sheet) && await page.getByRole('dialog').count() === 1;
  await page.keyboard.press('Escape');
  report.check(alone && await closed(sheet) && await focusReached(trigger),
    `${label} : « ${see} » — fiche des autres biens, seule ouverte, Échap rend le focus${viewport.mobile ? ' au lien des repères' : ''}`);
}

/** Accueil : le justificatif de la dernière zakat se télécharge (historique sur desktop, sous l'anneau sur mobile). */
async function checkHistoryPdf(page, locale, label) {
  const [profile, list] = await Promise.all([api(page, 'zakat/profile/'), api(page, CALCS)]);
  const last = list.results.find((row) => row.id !== profile.next_hawl?.calculation_id);
  await page.goto(`${BASE}/zakat`);
  const link = visibleLink(page, fmt(locale, 'zakat.home.history_pdf', { year: String(last.hawl_year) }));
  const file = await appears(link) ? await downloadPdf(page, link) : null;
  report.check(file?.pdf && file.name === `zakat-${last.hawl_year}.pdf`, `${label} : accueil — justificatif ${last.hawl_year} téléchargé`);
}

/**
 * Fiches Fondement au clavier depuis l'accueil : tiroir ou feuille contre son bord, focus piégé ; fiche Stock
 * (focus sur le retour, hadith discuté avec son badge, « Votre choix ») ; retour sur la fiche quittée ; Échap.
 */
async function checkBasisKeyboard(page, viewport, locale, label) {
  await page.goto(`${BASE}/zakat`);
  const see = msg(locale, 'zakat.basis.see_rules');
  const trigger = visibleButton(page, see);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const index = basisDialog(page, locale, 'index_title');
  const opened = await appears(index) && await docked(index, viewport.mobile) && await focusInside(index);
  report.check(opened && await tabTrapped(page, index),
    `${label} : « ${see} » au clavier — ${viewport.mobile ? 'feuille du bas' : 'tiroir de 440 px côté fin'}, focus piégé (Tab, Maj+Tab)`);
  await index.locator('[data-topic="stock"]').focus();
  await page.keyboard.press('Enter');
  const topic = basisDialog(page, locale, 'topic.stock.title');
  const shown = await appears(topic) && await focusReached(topic.locator('[data-basis-back]'));
  const yours = msg(locale, 'zakat.basis.your_choice');
  const badge = shown && await rowsWith(topic, msg(locale, 'zakat.basis.source.abu_dawud_1562.ref'), msg(locale, 'zakat.basis.badge.discussed')) === 1;
  const marked = shown && await rowsWith(topic, yours) === 1 && await rowsWith(topic, yours, msg(locale, 'zakat.choice.stock_valuation.purchase.title')) === 1;
  report.check(shown && badge && marked && await fitsWidth(topic),
    `${label} : fiche Stock — focus sur le retour, hadith discuté avec son badge, « ${yours} » sur le prix d'achat, sans débordement`);
  await page.keyboard.press('Enter');
  const back = await appears(index) && await focusReached(index.locator('[data-topic="stock"]'));
  await page.keyboard.press('Escape');
  report.check(back && await closed(index) && await focusReached(trigger),
    `${label} : retour à la liste (focus sur la fiche quittée), Échap ferme et rend le focus au lien`);
}

const toastWith = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text });
const rowWith = (page, text) => page.getByRole('listitem').filter({ hasText: text }).filter({ visible: true });
/** Début d'un message à date (« Versée le ») : la date elle-même est mise en forme par le navigateur. */
const prefixOf = (locale, key, name) => msg(locale, key).split(`{${name}}`)[0].trim();

/** Versement : feuille préremplie (aujourd'hui, zakat due), « Versée le … » au Résultat et dans l'historique, « Revenir ». */
async function checkPayment(page, locale, label, calc) {
  await page.goto(`${BASE}/zakat/${calc.id}?etape=7`);
  await visibleButton(page, msg(locale, 'zakat.payment.mark')).click();
  const sheet = page.getByRole('dialog', { name: msg(locale, 'zakat.payment.sheet_title'), exact: true });
  await sheet.getByRole('button', { name: msg(locale, 'zakat.payment.submit'), exact: true }).click();
  const done = await appears(toastWith(page, msg(locale, 'zakat.payment.done_paid')));
  const saved = await api(page, `${CALCS}${calc.id}/`);
  const edit = await appears(visibleButton(page, msg(locale, 'zakat.payment.edit')));
  report.check(done && edit && saved.paid_amount === saved.totals.zakat_now && saved.paid_on !== null && await noOverflow(page),
    `${label} : versement — enregistré avec la date et le montant proposés (${saved.paid_amount}), « ${msg(locale, 'zakat.payment.edit')} » affiché`);
  await page.goto(`${BASE}/zakat`);
  const badge = await appears(page.getByText(prefixOf(locale, 'zakat.status.paid', 'date')).filter({ visible: true }));
  await page.goto(`${BASE}/zakat/${calc.id}?etape=7`);
  await visibleButton(page, msg(locale, 'zakat.payment.revert')).click();
  const reverted = await appears(visibleButton(page, msg(locale, 'zakat.payment.mark')));
  report.check(badge && reverted && (await api(page, `${CALCS}${calc.id}/`)).paid_on === null,
    `${label} : historique « ${prefixOf(locale, 'zakat.status.paid', 'date')} … », puis « ${msg(locale, 'zakat.payment.revert')} » retire le versement`);
}

/**
 * Part de 50 % : dette personnelle comptée en entier ; dette jamais classée → « choix à faire », lien du
 * Résultat vers elle, pastille, puis « Boutique » choisi → montant déduit par ligne fourni par le serveur.
 */
async function checkScope(page, viewport, locale, label) {
  const debt = (fields) => ({ id: crypto.randomUUID(), category: 'loan', amount_within_12_months: fields.amount, ...fields });
  const personal = debt({ scope: 'personal', label: 'Audit perso', amount: '1000.00' });
  const unchosen = debt({ scope: null, label: 'Audit à classer', amount: '400.00' });
  const calc = await createCalc(page, {
    reference_date: isoDay(-3200), cash_amount: '700000.00', current_step: 6,
    choices: { ...CHOICES, ownership_share: '50.00' }, debt_items: [personal, unchosen],
  });
  const blocked = calc.totals.status === 'choice_missing' && calc.totals.missing_scopes.debts?.[0] === unchosen.id
    && calc.totals.debts_deducted === null && calc.totals.debt_deducted[personal.id] === null;
  await page.goto(`${BASE}/zakat/${calc.id}?etape=7`);
  const scopeLabel = fmt(locale, 'zakat.result.scope_label', { list: 'debts', count: 1 });
  await page.getByRole('link', { name: fmt(locale, 'zakat.result.missing_link', { label: scopeLabel, n: 6 }), exact: true }).filter({ visible: true }).click();
  // Tableau sur desktop, liste sur mobile.
  const row = (text) => page.locator('li, tr').filter({ hasText: text }).filter({ visible: true });
  const tagged = await appears(row(personal.label).filter({ hasText: msg(locale, 'zakat.steps.scope.personal') }));
  const flagged = await appears(row(unchosen.label).filter({ hasText: msg(locale, 'zakat.steps.scope.missing_tag') }));
  const noNote = await page.getByText(fmt(locale, 'zakat.steps.scope.share_note', { share: '50' })).count() === 0;
  report.check(blocked && tagged && flagged && noNote && page.url().includes('etape=6'),
    `${label} : part de 50 %, dette jamais classée — « choix à faire », rien de déduit, lien du Résultat vers elle et pastille « ${msg(locale, 'zakat.steps.scope.missing_tag')} »`);

  await row(unchosen.label).getByRole('button').click();
  const edit = page.getByRole('dialog', { name: msg(locale, 'zakat.steps.debts.sheet_edit'), exact: true });
  const editGroup = edit.getByRole('radiogroup', { name: fmt(locale, 'zakat.steps.scope.label', { kind: 'debt' }), exact: true });
  const editUnchecked = await appears(editGroup) && await editGroup.locator('[role="radio"][aria-checked="true"]').count() === 0;
  await editGroup.getByRole('radio').first().click();
  const saved = page.waitForResponse((r) => r.url().includes(calc.id) && r.request().method() === 'PATCH' && r.status() === 200, { timeout });
  await edit.getByRole('button', { name: msg(locale, 'zakat.common.save'), exact: true }).click();
  const { totals } = await (await saved).json();
  const perLine = totals.debt_deducted[personal.id] === '1000.00' && totals.debt_deducted[unchosen.id] === '200.00' && totals.debts_deducted === '1200.00';
  // Colonne « Déduit » (desktop) : la part appliquée à la ligne de la boutique, 200 sur 400.
  const column = viewport.mobile || await appears(row(unchosen.label).filter({ hasText: '200' }));
  report.check(editUnchecked && await closed(edit) && totals.status !== 'choice_missing' && perLine && column,
    `${label} : « Boutique » choisi sans pré-sélection — déduit par ligne du serveur (1 000 personnelle, 200 boutique), total 1 200`);

  await visibleButton(page, msg(locale, viewport.mobile ? 'zakat.steps.debts.add_short' : 'zakat.steps.debts.add')).click();
  const sheet = page.getByRole('dialog', { name: msg(locale, 'zakat.steps.debts.sheet_add'), exact: true });
  const group = sheet.getByRole('radiogroup', { name: fmt(locale, 'zakat.steps.scope.label', { kind: 'debt' }), exact: true });
  const unchecked = await appears(group) && await group.locator('[role="radio"][aria-checked="true"]').count() === 0;
  await sheet.getByRole('button', { name: msg(locale, 'zakat.common.add'), exact: true }).click();
  const required = await appears(sheet.getByText(msg(locale, 'zakat.common.scope_required'), { exact: true }));
  await page.keyboard.press('Escape');
  report.check(unchecked && required && await closed(sheet) && await noOverflow(page),
    `${label} : nouvelle dette — « Boutique / Personnelle » sans rien de coché, choix obligatoire`);
}

/** Créance manuelle « Encaissée » au montant proposé (toute la créance, aujourd'hui). */
async function collect(page, locale, row) {
  await row.getByRole('button', { name: msg(locale, 'zakat.followup.collected'), exact: true }).click();
  const sheet = page.getByRole('dialog', { name: msg(locale, 'zakat.followup.collected_sheet.title'), exact: true });
  await sheet.getByRole('button', { name: msg(locale, 'zakat.followup.collected_sheet.submit'), exact: true }).click();
  return closed(sheet);
}

/**
 * Suivi à l'encaissement d'une fiche « à l'encaissement » : créance sûre encaissée puis versée (plus de bouton
 * ensuite), créance douteuse encaissée avec trois options D4 sans rien de coché, puis la carte de l'accueil.
 */
async function checkFollowUps(page, locale, label) {
  const line = (label, amount, doubtful) => ({ id: crypto.randomUUID(), order_id: null, label, amount, doubtful, scope: 'shop' });
  const calc = await createCalc(page, {
    reference_date: isoDay(-2800), cash_amount: '700000.00', current_step: 6,
    choices: { ...CHOICES, receivables_mode: 'on_collection' },
    receivable_items: [line('Audit sûre', '1000.00', false), line('Audit douteuse', '500.00', true)],
  });
  const homeTitle = page.getByRole('heading', { name: msg(locale, 'zakat.followup.home_title'), exact: true });
  await page.goto(`${BASE}/zakat`);
  await page.getByRole('heading', { name: msg(locale, 'zakat.home.history_title'), exact: true }).waitFor();
  const quiet = await homeTitle.count() === 0;
  await page.goto(`${BASE}/zakat/${calc.id}?etape=7`);
  const sure = rowWith(page, 'Audit sûre');
  const pending = await appears(sure.filter({ hasText: msg(locale, 'zakat.followup.state.pending') }));
  const collected = pending && await collect(page, locale, sure);
  const pay = sure.getByRole('button', { name: msg(locale, 'zakat.followup.mark_paid'), exact: true });
  if (await appears(pay)) await pay.click();
  const paid = await appears(sure.filter({ hasText: msg(locale, 'zakat.followup.revert.paid') })) && await pay.count() === 0;
  report.check(quiet && collected && paid && await noOverflow(page),
    `${label} : suivi — accueil sans carte avant encaissement, créance sûre « Encaissée » puis versée une seule fois`);
  const doubtful = rowWith(page, 'Audit douteuse');
  await collect(page, locale, doubtful);
  const group = doubtful.getByRole('radiogroup', { name: msg(locale, 'zakat.followup.choice_label'), exact: true });
  const three = await appears(group) && await group.getByRole('radio').count() === 3
    && await group.locator('[aria-checked="true"]').count() === 0;
  await group.getByRole('radio').filter({ hasText: msg(locale, 'zakat.basis.opinion.doubtful.one_year.title') }).click();
  const chosen = await appears(group.locator('[aria-checked="true"]').filter({ hasText: msg(locale, 'zakat.basis.opinion.doubtful.one_year.title') }));
  await page.goto(`${BASE}/zakat`);
  const card = await appears(homeTitle) && await appears(rowWith(page, 'Audit douteuse'));
  report.check(three && chosen && card && await noOverflow(page),
    `${label} : créance douteuse encaissée — trois options D4, aucune cochée, choix enregistré, carte « ${msg(locale, 'zakat.followup.home_title')} » à l'accueil`);
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
      const due = await checkResult(page, viewport, locale, label);
      await checkWhy(page, locale, label, due);
      await checkOtherSources(page, viewport, locale, label, due);
      await checkHistoryPdf(page, locale, label);
      await checkBasisKeyboard(page, viewport, locale, label);
      await checkPayment(page, locale, label, due);
      await checkScope(page, viewport, locale, label);
      await checkFollowUps(page, locale, label);
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
