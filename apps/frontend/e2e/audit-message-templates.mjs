/**
 * Audit des modèles de messages WhatsApp (Paramètres › Messages WhatsApp), à 1440px et 360px,
 * en clair et en sombre, en français et en arabe :
 * - liste des modèles à gauche (desktop) ou menu de sélection (mobile) : choisir un modèle affiche son texte ;
 * - changer de ton → l'aperçu suit (rendu du serveur), puis, enregistré, « Relancer » de la fiche
 *   commande prépare le même texte ; « Modifier le modèle » de cette fenêtre ouvre le modèle ;
 * - personnaliser un modèle (« Personnalisé », enregistré), puis « Rétablir le texte du ton choisi » ;
 * - une variable inconnue est refusée : message sous le champ, rien d'enregistré ; l'API répond 400
 *   avec la liste des variables permises ;
 * - un texte tapé pendant l'enregistrement reste dans le champ, toujours à enregistrer.
 * Commande impayée d'un client dédié « Audit Modèles » (la dernière de la boutique : l'aperçu la
 * reprend) ; les réglages sont remis au ton chaleureux sans personnalisation à chaque passage.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { textbox, visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const CUSTOMER = 'Audit Modèles';
const PHONE = '+33698765432';
const TEMPLATE = 'unpaid_followup';
const RESET = { tone: 'warm', texts: { order_confirmation: null, tracking: null, unpaid_followup: null, thank_you: null, promo: null } };
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const M = (locale, key, params) => (params ? fmt(locale, `settings.messages.${key}`, params) : msg(locale, `settings.messages.${key}`));
const flat = (text) => text.replace(/\s+/g, ' ').trim();

/** Relit `read` jusqu'à ce que `ok` soit vrai (8 s au plus). */
async function eventually(read, ok) {
  for (let i = 0; i < 16; i += 1) {
    if (ok(await read())) return true;
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
  return false;
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER, phone: PHONE } });
  const order = await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: 'Audit modèles', quantity: 2, unit_price: '7.50' }] },
  });
  return { customer, order };
}

const settingsOf = (page, locale) => api(page, `messages/settings/?lang=${locale}`);
const rendered = async (page, locale, text, tone) =>
  (await api(page, 'messages/preview/', { method: 'POST', data: { text, tone, lang: locale } })).message;

/** Bulle de l'aperçu : texte rendu (sans l'heure). */
function bubble(page, locale) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: M(locale, 'preview_title'), exact: true }) })
    .locator('div[dir="auto"]');
}
const bubbleShows = (page, locale, expected) =>
  eventually(async () => flat(await bubble(page, locale).first().innerText().catch(() => '')), (text) => text.includes(flat(expected)));

/** Choix du modèle : bouton de la liste (desktop) ou menu de sélection (mobile). */
async function selectTemplate(page, ctx, key) {
  const label = M(ctx.locale, 'template', { key, mode: 'other' });
  if (ctx.viewport.mobile) {
    await page.getByRole('combobox', { name: M(ctx.locale, 'template_label') }).filter({ visible: true }).click();
    await page.getByRole('option', { name: label }).click();
  } else {
    await page.getByRole('navigation', { name: M(ctx.locale, 'templates_title') }).getByRole('button', { name: label }).click();
  }
}

async function chooseTone(page, locale, tone) {
  const radio = page.getByRole('radio', { name: M(locale, 'tone', { tone }) });
  await radio.locator('xpath=..').click();
  return radio.isChecked();
}

/**
 * Le toast de l'enregistrement précédent peut être encore affiché : il est marqué avant le clic, seul un
 * nouveau toast (émis après la remise à zéro du formulaire) compte. Sinon la saisie suivante serait effacée.
 */
async function save(page, locale) {
  await page.locator('[data-sonner-toast]').evaluateAll((toasts) => toasts.forEach((el) => { el.dataset.stale = ''; }));
  await visibleButton(page, M(locale, 'submit')).click();
  return shown(page.locator('[data-sonner-toast]:not([data-stale])').filter({ hasText: M(locale, 'saved') }));
}

async function checkLayout(page, ctx, defaults) {
  const { label, locale, viewport } = ctx;
  const nav = page.getByRole('navigation', { name: M(locale, 'templates_title') });
  const select = page.getByRole('combobox', { name: M(locale, 'template_label') });
  report.check(viewport.mobile ? await select.isVisible() && !await nav.isVisible() : await nav.isVisible() && !await select.isVisible(),
    `${label} : modèles en ${viewport.mobile ? 'menu de sélection' : 'liste à gauche'}`);
  await selectTemplate(page, ctx, 'thank_you');
  const field = textbox(page, M(locale, 'text_label'));
  report.check(await eventually(() => field.inputValue(), (v) => v === defaults.warm.thank_you),
    `${label} : « ${M(locale, 'template', { key: 'thank_you', mode: 'other' })} » choisi → son texte dans l'éditeur`);
  await selectTemplate(page, ctx, TEMPLATE);
}

async function checkTone(page, ctx, { order }, defaults) {
  const { label, locale } = ctx;
  const warm = await rendered(page, locale, defaults.warm[TEMPLATE], 'warm');
  const pro = await rendered(page, locale, defaults.professional[TEMPLATE], 'professional');
  report.check(await bubbleShows(page, locale, warm) && await shown(page.getByText(order.order_number).filter({ visible: true })),
    `${label} : aperçu de la relance sur la commande ${order.order_number}, ton chaleureux`);
  const checked = await chooseTone(page, locale, 'professional');
  report.check(checked && await bubbleShows(page, locale, pro)
      && await textbox(page, M(locale, 'text_label')).inputValue() === defaults.professional[TEMPLATE],
    `${label} : ton « ${M(locale, 'tone', { tone: 'professional' })} » → éditeur et aperçu suivent`);
  report.check(await save(page, locale) && (await settingsOf(page, locale)).tone === 'professional',
    `${label} : ton professionnel enregistré`);

  await goto(page, `/orders/${order.id}`);
  await visibleButton(page, msg(locale, 'orders.paymentCard.remind_cta')).click();
  const message = page.getByRole('textbox', { name: msg(locale, 'messages.prepared.message_label') });
  report.check(await shown(message) && flat(await message.inputValue()) === flat(pro),
    `${label} : « ${msg(locale, 'orders.paymentCard.remind_cta')} » de la commande → relance au ton professionnel`);
  await page.getByRole('link', { name: msg(locale, 'messages.prepared.edit_template') }).click();
  await page.waitForURL(/\/settings\/messages\?template=unpaid_followup$/);
  await page.waitForLoadState('networkidle');
  report.check(await eventually(() => textbox(page, M(locale, 'text_label')).inputValue(), (v) => v === defaults.professional[TEMPLATE]),
    `${label} : « ${msg(locale, 'messages.prepared.edit_template')} » → la relance ouverte dans les modèles`);
}

async function checkCustomize(page, ctx, defaults) {
  const { label, locale } = ctx;
  const field = textbox(page, M(locale, 'text_label'));
  const custom = `${locale === 'ar' ? 'مرحبًا' : 'Bonjour'} {client} — {reste} · {boutique}`;
  await field.fill(custom);
  const marked = ctx.viewport.mobile
    ? page.getByRole('combobox', { name: M(locale, 'template_label') }).filter({ hasText: M(locale, 'customized') })
    : page.getByRole('navigation', { name: M(locale, 'templates_title') }).getByText(M(locale, 'customized'), { exact: true });
  report.check(await shown(marked) && await bubbleShows(page, locale, await rendered(page, locale, custom, 'professional')),
    `${label} : texte modifié → « ${M(locale, 'customized')} », aperçu rendu`);
  report.check(await save(page, locale) && (await settingsOf(page, locale)).texts[TEMPLATE] === custom, `${label} : texte personnalisé enregistré`);
  await visibleButton(page, M(locale, 'reset')).click();
  report.check(await field.inputValue() === defaults.professional[TEMPLATE] && await save(page, locale)
      && !(TEMPLATE in (await settingsOf(page, locale)).texts),
    `${label} : « ${M(locale, 'reset')} » → texte du ton, personnalisation retirée`);
}

async function checkUnknownVariable(page, ctx, variables) {
  const { label, locale } = ctx;
  const field = textbox(page, M(locale, 'text_label'));
  await field.fill('Bonjour {prenom}');
  await visibleButton(page, M(locale, 'submit')).click();
  const error = M(locale, 'unknown_variable', { names: '{prenom}', allowed: variables.map((v) => `{${v}}`).join(', ') });
  report.check(await shown(page.getByText(error)) && !(TEMPLATE in (await settingsOf(page, locale)).texts),
    `${label} : variable inconnue {prenom} → refusée sous le champ, rien d'enregistré`);
  await visibleButton(page, M(locale, 'reset')).click();
  const res = await page.request.fetch(`${BASE}/api/proxy/messages/settings/`, { method: 'PATCH', data: { texts: { [TEMPLATE]: 'Bonjour {prenom}' } } });
  const body = await res.json().catch(() => ({}));
  report.check(res.status() === 400 && Array.isArray(body.allowed_variables) && body.allowed_variables.includes('{client}'),
    `${label} : API → 400 avec les variables permises (${res.status()})`);
}

/**
 * Saisie pendant l'enregistrement : la requête est retenue le temps de taper un autre texte. Une fois
 * enregistré, le champ garde ce texte et reste non enregistré (bouton actif) ; le serveur a le premier.
 */
async function checkTypingDuringSave(page, ctx) {
  const { label, locale } = ctx;
  const field = textbox(page, M(locale, 'text_label'));
  const [first, second] = ['{client} — 1', '{client} — 2'];
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let reached;
  const sent = new Promise((resolve) => { reached = resolve; });
  await page.route(/\/api\/proxy\/messages\/settings\//, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    reached();
    await held;
    return route.continue();
  });
  await field.fill(first);
  await page.locator('[data-sonner-toast]').evaluateAll((toasts) => toasts.forEach((el) => { el.dataset.stale = ''; }));
  await visibleButton(page, M(locale, 'submit')).click();
  await sent;
  await field.fill(second);
  release();
  const saved = await shown(page.locator('[data-sonner-toast]:not([data-stale])').filter({ hasText: M(locale, 'saved') }));
  await page.unroute(/\/api\/proxy\/messages\/settings\//);
  report.check(saved && await field.inputValue() === second && await visibleButton(page, M(locale, 'submit')).isEnabled()
      && (await settingsOf(page, locale)).texts[TEMPLATE] === first,
    `${label} : texte tapé pendant l'enregistrement → gardé, toujours à enregistrer (« ${await field.inputValue()} »)`);
  await visibleButton(page, M(locale, 'reset')).click();
  await save(page, locale);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const data = await setup(page);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      if (!inMatrix(viewport, locale, theme)) continue;
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const run = { label, locale, viewport };
      try {
        await api(page, 'messages/settings/', { method: 'PATCH', data: RESET });
        const { defaults, variables } = await settingsOf(page, locale);
        await goto(page, '/settings/messages');
        await checkLayout(page, run, defaults);
        await checkTone(page, run, data, defaults);
        await checkCustomize(page, run, defaults);
        await checkUnknownVariable(page, run, variables);
        await checkTypingDuringSave(page, run);
      } catch (error) {
        report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
      }
      const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await api(page, 'messages/settings/', { method: 'PATCH', data: RESET });
  await api(page, `orders/${data.order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
  await ctx.close();
}
await browser.close();
report.finish();
