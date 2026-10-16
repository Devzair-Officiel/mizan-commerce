/**
 * Audit de la page Paramètres → Abonnement, en français clair à 1440px et en arabe sombre à 360px
 * (quelle que soit la matrice), dans trois situations :
 * - essai Boutique (jour 4 sur 14) : « Votre formule » avec la barre « Jour 4 sur 14 » et un seul CTA
 *   « Garder Boutique », à droite sur desktop ; « Votre activité » comparée aux plafonds Découverte :
 *   une rangée de cartes (2 colonnes sur mobile), statut écrit (« Dans la limite », ambre, rouge),
 *   sans carte « équipe » pour un propriétaire seul, avec pour une équipe de 3 (« Au-delà de la limite ») ;
 * - Découverte : jauges de la formule, pas de résiliation ;
 * - Solo actif : « Formule Solo active », carte Solo « Formule actuelle », résiliation discrète.
 * Partout : 4 cartes côte à côte sur desktop, pastille « Recommandé » à cheval sur le haut de la carte
 * Boutique, côté début de ligne (à droite en arabe), CTA en bas de chaque carte, après la liste, à la même
 * hauteur d'une carte à l'autre (Découverte : son texte à la place du bouton), une par onglet sur mobile (onglet par défaut : formule
 * payante courante, sinon Boutique) ; Mensuel / Annuel (« 2 mois offerts ») ; un CTA ouvre la fenêtre
 * « paiement pas encore activé » sans aucune requête au serveur ; la résiliation demande confirmation.
 * La formule est réécrite dans la réponse `/subscriptions/current/` (comme audit-usage) : rien n'est résilié.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { animationsDone } from './lib/wait.mjs';

const report = createReport();
const CONFIGS = [['1440', 'fr', 'light'], ['360', 'ar', 'dark']];
const DAY = 24 * 60 * 60 * 1000;
const USAGE = { products: 3, orders_this_month: 12, customers: 15, members: 1 };
const TEAM = 3;

/** Réponse `/subscriptions/current/` de la situation `state.mode`. */
function situation(subscription, mode, members) {
  const now = Date.now();
  const usage = (limits) => Object.fromEntries(Object.entries({ ...USAGE, members })
    .map(([key, count]) => [key, { count, limit: limits[key] ?? null }]));
  const base = { ...subscription, is_trial_expired: false, cancel_at_period_end: false };
  if (mode === 'trial') {
    return { ...base, status: 'trialing', effective_plan_code: 'boutique', plan: { ...subscription.plan, code: 'boutique' },
      current_period_start: new Date(now - 4 * DAY).toISOString(), current_period_end: new Date(now + 10 * DAY + 3600e3).toISOString(),
      days_remaining: 10, usage: usage({}) };
  }
  const code = mode === 'free' ? 'free' : 'solo';
  const limits = mode === 'free' ? { products: 30, orders_this_month: 15, customers: 15, members: 1 } : {};
  return { ...base, status: 'active', effective_plan_code: code, plan: { ...subscription.plan, code },
    current_period_end: null, days_remaining: null, usage: usage(limits) };
}

async function routePlan(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/current\/?(\?.*)?$/, async (route) => {
    try {
      const response = await route.fetch();
      await route.fulfill({ response, json: situation(await response.json(), state.mode, state.members) });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

const visibleCards = (page) => page.locator('[data-plan]').filter({ visible: true })
  .evaluateAll((els) => els.map((el) => el.dataset.plan));

async function checkCurrent(page, locale, label, mode, mobile) {
  const card = page.locator('[data-current-plan]');
  const expected = { trial: 'boutique', free: 'free', paid: 'solo' }[mode];
  const buttons = await card.getByRole('button').allTextContents();
  const name = msg(locale, `settings.subscription.plans.${expected}.name`);
  const text = await card.textContent();
  const ok = mode === 'trial'
    ? text.includes(fmt(locale, 'settings.subscription.trial_day', { day: 4, total: 14 })) && buttons.length === 1 && buttons[0].includes(name)
    : buttons.length === 0 && text.includes(mode === 'free' ? msg(locale, 'settings.subscription.free_forever') : name);
  report.check(await card.getAttribute('data-current-plan') === expected && ok,
    `${label} : « Votre formule » ${name}${mode === 'trial' ? ', jour 4 sur 14, un seul CTA « Garder »' : ', sans CTA'} (${buttons.join(' | ')})`);
  if (mode !== 'trial') return;
  const bar = await card.locator('[data-trial-bar]').boundingBox();
  const cta = await card.getByRole('button').boundingBox();
  const beside = cta.x >= bar.x + bar.width || cta.x + cta.width <= bar.x;
  report.check(mobile ? cta.y > bar.y + bar.height : beside,
    `${label} : CTA « Garder » ${mobile ? 'sous la barre d\'essai' : 'en regard du texte'}`);
}

/** Cartes de « Votre activité » : une rangée sur desktop, deux colonnes sur mobile. */
async function rowsOf(activity) {
  const boxes = await activity.locator('[data-usage]').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  return [...new Set(boxes)].map((top) => boxes.filter((t) => t === top).length).join('+');
}

async function checkActivity(page, locale, label, mode, members, mobile) {
  const activity = page.locator('[data-activity]');
  const gauges = await activity.locator('[data-usage]').evaluateAll((els) => els.map((el) => `${el.dataset.usage}:${el.dataset.level}`));
  const level = (value) => fmt(locale, 'settings.usage.level', { level: value });
  const team = members > 1;
  const text = await activity.textContent();
  const products = await activity.locator('[data-usage=products]').textContent();
  const orders = await activity.locator('[data-usage=orders_this_month]').textContent();
  const limits = mode !== 'free' ? text.includes(msg(locale, 'settings.subscription.activity_limits')) : true;
  report.check(await activity.getAttribute('data-activity') === (mode === 'free' ? 'plan' : 'free_limits')
    && gauges.join(',') === `orders_this_month:near,products:ok,customers:reached${team ? ',members:reached' : ''}`
    && products.includes(level('ok')) && text.includes(level('near')) && text.includes(level('reached'))
    && text.includes(level('over')) === team && orders.includes('12') && orders.includes('/ 15') && limits,
  `${label} : « Votre activité » ${mode === 'free' ? 'de la formule' : 'face aux plafonds Découverte'}, « ${level('ok')} » écrit, `
    + `${team ? `équipe de ${members} au-delà de la limite` : 'sans carte « équipe » (propriétaire seul)'} (${gauges.join(', ')})`);
  const rows = await rowsOf(activity);
  const expected = mobile ? (team ? '2+2' : '2+1') : (team ? '4' : '3');
  report.check(rows === expected, `${label} : cartes d'activité ${mobile ? 'sur deux colonnes' : 'en une rangée'} (${rows})`);
}

/** « Recommandé » à cheval sur le bord supérieur de la carte Boutique, côté début de ligne. */
async function checkBadge(page, locale, label) {
  const card = page.locator('[data-plan=boutique]');
  if (!(await card.isVisible())) return;
  const pill = card.locator('[data-recommended]');
  const [c, p] = [await card.boundingBox(), await pill.boundingBox()];
  const rtl = locale === 'ar';
  const startSide = rtl ? c.x + c.width - (p.x + p.width) < c.width / 3 : p.x - c.x < c.width / 3;
  report.check(p.y < c.y && p.y + p.height > c.y && startSide && (await pill.textContent()) === msg(locale, 'settings.subscription.recommended'),
    `${label} : « ${msg(locale, 'settings.subscription.recommended')} » flotte sur le bord supérieur de Boutique, ${rtl ? 'à droite' : 'à gauche'}`);
}

/** Même situation avec une équipe de plusieurs membres : la jauge « équipe » apparaît. */
async function checkTeam(page, locale, label, mode, state, mobile) {
  state.members = TEAM;
  try {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.locator('[data-activity]').waitFor({ timeout: 10000 });
    await checkActivity(page, locale, `${label} équipe`, mode, TEAM, mobile);
  } finally {
    state.members = USAGE.members;
  }
}

async function checkCards(page, locale, label, mode, mobile) {
  const defaultTab = mode === 'paid' ? 'solo' : 'boutique';
  const cards = await visibleCards(page);
  report.check(mobile ? cards.join() === defaultTab : cards.join() === 'free,solo,boutique,commerce_plus',
    `${label} : ${mobile ? `une carte, onglet par défaut ${defaultTab}` : '4 cartes côte à côte'} (${cards.join(', ')})`);
  if (mobile) {
    await page.getByRole('tab', { name: msg(locale, 'settings.subscription.plans.commerce_plus.name') }).click();
    report.check((await visibleCards(page)).join() === 'commerce_plus', `${label} : l'onglet Commerce+ montre sa carte`);
  }
  const current = page.locator(`[data-plan=${mode === 'paid' ? 'solo' : 'free'}]`).getByText(msg(locale, 'settings.subscription.current'), { exact: true });
  if (mode !== 'trial' && !mobile) report.check(await current.isVisible(), `${label} : la carte de la formule en cours porte « Formule actuelle »`);
}

/** Bas de la carte visible : liste, puis CTA (ou texte de Découverte) collé au bas de la carte. */
async function ctaPlacement(page) {
  return page.locator('[data-plan]').filter({ visible: true }).evaluateAll((cards) => cards.map((card) => {
    const [c, list, cta] = [card, card.querySelector('ul'), card.querySelector('[data-plan-cta]')].map((el) => el?.getBoundingClientRect());
    const atBottom = cta && list && cta.top >= list.bottom && c.bottom - cta.bottom <= 24;
    return { plan: card.dataset.plan, top: Math.round(cta?.top ?? -1), height: Math.round(cta?.height ?? 0), atBottom };
  }));
}

async function checkCtaBottom(page, locale, label, mobile) {
  let placements = await ctaPlacement(page);
  if (mobile) {
    placements = [];
    for (const code of ['free', 'solo', 'boutique', 'commerce_plus']) {
      await page.getByRole('tab', { name: msg(locale, `settings.subscription.plans.${code}.name`) }).click();
      placements.push(...await ctaPlacement(page));
    }
  }
  const sameLine = mobile || new Set(placements.map((p) => p.top)).size === 1;
  report.check(placements.length === 4 && placements.every((p) => p.atBottom && p.height === 44) && sameLine,
    `${label} : CTA en bas de carte, après la liste${mobile ? ', onglet par onglet' : ', alignés sur une ligne'} `
      + `(${placements.map((p) => `${p.plan}${p.atBottom ? '' : ' ✗'}@${p.top}`).join(', ')})`);
}

async function checkYearly(page, locale, label) {
  const yearly = page.getByRole('button', { name: new RegExp(`^${fmt(locale, 'settings.subscription.period', { period: 'year' })}`) });
  const badge = fmt(locale, 'settings.subscription.free_months', { months: 2 });
  const hasBadge = (await yearly.textContent()).includes(badge);
  await yearly.click();
  const perYear = fmt(locale, 'settings.subscription.per', { period: 'year' });
  const card = page.locator('[data-plan]').filter({ visible: true }).last();
  report.check(hasBadge && await yearly.getAttribute('aria-pressed') === 'true' && (await card.textContent()).includes(perYear),
    `${label} : « Annuel · ${badge} », prix « ${perYear} »`);
}

async function checkChoose(page, locale, label, requests) {
  const card = page.locator('[data-plan]').filter({ visible: true }).filter({ has: page.getByRole('button') }).last();
  requests.length = 0;
  await card.getByRole('button').click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  await animationsDone(sheet);
  const text = await sheet.textContent();
  report.check(text.includes(msg(locale, 'settings.subscription.payment_pending')) && requests.length === 0,
    `${label} : le CTA ouvre « paiement pas encore activé », sans requête au serveur (${requests.join(', ') || 'aucune'})`);
  await sheet.getByRole('button', { name: msg(locale, 'settings.subscription.payment_ok'), exact: true }).click();
  await sheet.waitFor({ state: 'hidden' });
}

async function checkCancel(page, locale, label, mode) {
  const cancel = page.getByRole('button', { name: msg(locale, 'settings.subscription.cancel_cta'), exact: true });
  if (mode === 'free') {
    report.check(await cancel.count() === 0, `${label} : pas de résiliation sur Découverte`);
    return;
  }
  await cancel.click();
  const dialog = page.getByRole('dialog', { name: msg(locale, 'settings.subscription.cancel_title') });
  await dialog.waitFor();
  await animationsDone(dialog);
  await dialog.getByRole('button', { name: msg(locale, 'settings.subscription.cancel_back'), exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  report.check(true, `${label} : « ${msg(locale, 'settings.subscription.cancel_cta')} » demande confirmation, « ${msg(locale, 'settings.subscription.cancel_back')} » referme`);
}

const browser = await launch();
for (const [name, locale, theme] of CONFIGS) {
  const viewport = VIEWPORTS.find((v) => v.name === name);
  if (!viewport) continue;
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const state = { mode: 'trial', members: USAGE.members };
  const requests = [];
  page.on('request', (r) => { if (r.method() !== 'GET' && r.url().includes('/api/proxy/subscriptions/')) requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await routePlan(ctx, state);
  await setLocale(locale);
  setTheme(theme);
  for (const mode of ['trial', 'free', 'paid']) {
    const label = `${name}px ${locale} ${theme} ${mode}`;
    console.log(`\n=== ${label}`);
    watch.setLabel(label);
    state.mode = mode;
    try {
      await page.goto(`${BASE}/settings/subscription`);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-current-plan]').waitFor({ timeout: 10000 });
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/abonnement-${name}-${locale}-${theme}-${mode}.png`, fullPage: true });
      await checkCurrent(page, locale, label, mode, viewport.mobile);
      await checkActivity(page, locale, label, mode, USAGE.members, viewport.mobile);
      await checkBadge(page, locale, label);
      await checkCards(page, locale, label, mode, viewport.mobile);
      await checkCtaBottom(page, locale, label, viewport.mobile);
      await checkYearly(page, locale, label);
      await checkChoose(page, locale, label, requests);
      await checkCancel(page, locale, label, mode);
      await checkTeam(page, locale, label, mode, state, viewport.mobile);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    }
  }
  report.check(watch.problems.length === 0, `${name}px ${locale} ${theme} : console propre, défilement jamais bloqué${watch.problems.map((p) => `\n      ${p}`).join('')}`);
  await ctx.close();
}
await browser.close();
report.finish();
