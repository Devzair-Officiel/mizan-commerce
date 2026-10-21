/**
 * Audit léger des jauges d'usage et de la carte de mise à niveau, en formule Découverte, en français clair à 1440px
 * et en arabe sombre à 360px (quelle que soit la matrice) :
 * - à 12 ventes sur 15, le bandeau de /orders porte la jauge « 12 / 15 ventes ce mois », en ambre ;
 * - à 15 sur 15, la jauge passe au rouge, et « Nouvelle commande » ouvre la fenêtre de mise à niveau (carte Solo,
 *   bouton vers Paramètres → Abonnement) au lieu de mener au formulaire ;
 * - Paramètres → Abonnement montre les jauges de la formule, puis, à part, « Ce mois-ci » : 8 / 10 lectures avancées
 *   en ambre, « Bientôt à la limite » écrit.
 * L'usage et la formule sont réécrits dans la réponse `/subscriptions/current/` (comme audit-stock-entry-plan) :
 * la boutique d'audit reste en Boutique, aucune vente n'est créée.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { animationsDone } from './lib/wait.mjs';

const report = createReport();
const CONFIGS = [['1440', 'fr', 'light'], ['360', 'ar', 'dark']];
const LIMIT = 15;
const AI_READS = { count: 8, limit: 10 };

/** Formule Découverte, `state.orders` ventes ce mois sur 15. */
async function routePlan(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/current\/?(\?.*)?$/, async (route) => {
    try {
      const response = await route.fetch();
      const subscription = await response.json();
      await route.fulfill({
        response,
        json: {
          ...subscription,
          status: 'active',
          is_trial_expired: false,
          days_remaining: null,
          effective_plan_code: 'free',
          plan: { ...subscription.plan, code: 'free' },
          usage: {
            products: { count: 3, limit: 30 },
            orders_this_month: { count: state.orders, limit: LIMIT },
            customers: { count: 2, limit: 15 },
            members: { count: 1, limit: 1 },
          },
          ai_reads_enabled: true,
          ai_reads: AI_READS,
        },
      });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

/** Jauge des ventes du bandeau de /orders : son texte et son niveau. */
async function bannerGauge(page) {
  await page.goto(`${BASE}/orders`);
  await page.waitForLoadState('networkidle');
  const gauge = page.getByTestId('usage-banner').locator('[data-usage=orders_this_month]');
  await gauge.waitFor({ timeout: 10000 });
  return { text: (await gauge.locator('p').textContent())?.trim(), level: await gauge.getAttribute('data-level') };
}

async function checkNear(page, locale, label, state) {
  state.orders = 12;
  const gauge = await bannerGauge(page);
  const expected = fmt(locale, 'settings.usage.orders_this_month', { count: 12, limit: LIMIT });
  report.check(gauge.text === expected && gauge.level === 'near', `${label} : à 12/15, bandeau « ${gauge.text} » en ambre (${gauge.level})`);
}

async function checkReached(page, locale, label, state) {
  state.orders = LIMIT;
  const gauge = await bannerGauge(page);
  report.check(gauge.level === 'reached', `${label} : à 15/15, jauge du bandeau au rouge (${gauge.level})`);
  // Bouton de création de l'en-tête de liste (le premier ; l'état vide peut en porter un second).
  const create = page.getByRole('main').getByRole('link', { name: msg(locale, 'orders.list.new_order'), exact: true })
    .filter({ visible: true }).first();
  await create.click();
  const sheet = page.getByRole('dialog', { name: msg(locale, 'settings.usage.limit_title') });
  await sheet.waitFor();
  await animationsDone(sheet);
  const title = fmt(locale, 'settings.upgrade.title', { feature: 'orders_this_month', plan: 'solo' });
  const cta = sheet.getByRole('link', { name: msg(locale, 'settings.upgrade.cta'), exact: true });
  report.check(new URL(page.url()).pathname === '/orders'
    && await sheet.getByRole('heading', { name: title, exact: true }).isVisible()
    && (await cta.getAttribute('href')) === '/settings/subscription',
  `${label} : « ${msg(locale, 'orders.list.new_order')} » ouvre la carte « ${title} », sans quitter la liste`);
  await page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'hidden' });
}

async function checkSettings(page, locale, label) {
  await page.goto(`${BASE}/settings/subscription`);
  await page.waitForLoadState('networkidle');
  const gauges = page.locator('[data-usage]');
  await gauges.first().waitFor({ timeout: 10000 });
  const keys = await gauges.evaluateAll((els) => els.map((el) => el.dataset.usage));
  report.check(keys.join(',') === 'orders_this_month,products,customers,ai_reads_this_month', `${label} : Paramètres → Abonnement, jauges ${keys.join(', ')}`);
  const reads = page.locator('[data-ai-reads] [data-usage=ai_reads_this_month]');
  const text = await reads.textContent();
  const near = fmt(locale, 'settings.usage.level', { level: 'near' });
  report.check(await reads.getAttribute('data-level') === 'near' && text.includes(fmt(locale, 'settings.usage.ai_reads_this_month', AI_READS))
    && text.includes(near), `${label} : « ${msg(locale, 'settings.subscription.ai_reads_title')} », 8 / 10 lectures avancées en ambre, « ${near} »`);
}

const browser = await launch();
try {
  for (const [name, locale, theme] of CONFIGS) {
    const viewport = VIEWPORTS.find((v) => v.name === name);
    if (!viewport) continue;
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const state = { orders: 12 };
    await routePlan(ctx, state);
    const label = `${name}px ${locale} ${theme}`;
    console.log(`\n=== ${label}`);
    await setLocale(locale);
    setTheme(theme);
    watch.setLabel(label);
    try {
      await checkNear(page, locale, label, state);
      await checkReached(page, locale, label, state);
      await checkSettings(page, locale, label);
    } catch (error) {
      report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
    }
    report.check(watch.problems.length === 0, `${label} : console propre, défilement jamais bloqué${watch.problems.map((p) => `\n      ${p}`).join('')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
