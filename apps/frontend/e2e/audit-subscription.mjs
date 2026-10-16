/**
 * Audit de la page Paramètres → Abonnement, en français clair à 1440px et en arabe sombre à 360px
 * (quelle que soit la matrice), dans trois situations :
 * - essai Boutique (jour 4 sur 14) : « Votre formule » avec la barre « Jour 4 sur 14 » et un seul CTA
 *   « Garder Boutique » ; « Votre activité » comparée aux plafonds Découverte (ambre, rouge, niveau écrit) ;
 * - Découverte : jauges de la formule, pas de résiliation ;
 * - Solo actif : « Formule Solo active », carte Solo « Formule actuelle », résiliation discrète.
 * Partout : 4 cartes côte à côte sur desktop, une par onglet sur mobile (onglet par défaut : formule
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

/** Réponse `/subscriptions/current/` de la situation `state.mode`. */
function situation(subscription, mode) {
  const now = Date.now();
  const usage = (limits) => Object.fromEntries(Object.entries(USAGE).map(([key, count]) => [key, { count, limit: limits[key] ?? null }]));
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
      await route.fulfill({ response, json: situation(await response.json(), state.mode) });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

const visibleCards = (page) => page.locator('[data-plan]').filter({ visible: true })
  .evaluateAll((els) => els.map((el) => el.dataset.plan));

async function checkCurrent(page, locale, label, mode) {
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
}

async function checkActivity(page, locale, label, mode) {
  const activity = page.locator('[data-activity]');
  const gauges = await activity.locator('[data-usage]').evaluateAll((els) => els.map((el) => `${el.dataset.usage}:${el.dataset.level}`));
  const reached = fmt(locale, 'settings.usage.level', { level: 'reached' });
  const near = fmt(locale, 'settings.usage.level', { level: 'near' });
  const text = await activity.textContent();
  report.check(await activity.getAttribute('data-activity') === (mode === 'free' ? 'plan' : 'free_limits')
    && gauges.join(',') === 'orders_this_month:near,products:ok,customers:reached,members:reached'
    && text.includes(near) && text.includes(reached),
  `${label} : « Votre activité » ${mode === 'free' ? 'de la formule' : 'face aux plafonds Découverte'}, niveaux écrits (${gauges.join(', ')})`);
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
  const recommended = page.locator('[data-plan=boutique]').getByText(msg(locale, 'settings.subscription.recommended'), { exact: true });
  if (!mobile) report.check(await recommended.isVisible(), `${label} : Boutique porte « ${msg(locale, 'settings.subscription.recommended')} »`);
  const current = page.locator(`[data-plan=${mode === 'paid' ? 'solo' : 'free'}]`).getByText(msg(locale, 'settings.subscription.current'), { exact: true });
  if (mode !== 'trial' && !mobile) report.check(await current.isVisible(), `${label} : la carte de la formule en cours porte « Formule actuelle »`);
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
  const state = { mode: 'trial' };
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
      await checkCurrent(page, locale, label, mode);
      await checkActivity(page, locale, label, mode);
      await checkCards(page, locale, label, mode, viewport.mobile);
      await checkYearly(page, locale, label);
      await checkChoose(page, locale, label, requests);
      await checkCancel(page, locale, label, mode);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    }
  }
  report.check(watch.problems.length === 0, `${name}px ${locale} ${theme} : console propre, défilement jamais bloqué${watch.problems.map((p) => `\n      ${p}`).join('')}`);
  await ctx.close();
}
await browser.close();
report.finish();
