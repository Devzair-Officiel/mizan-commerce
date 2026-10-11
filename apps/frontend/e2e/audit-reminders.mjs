/**
 * Audit des rappels, à 1440px et 360px, en clair et en sombre, en français et en arabe :
 * - l'onglet « À faire » donne le même chiffre que le badge du menu et l'accueil (API) ;
 * - terminer ou supprimer un rappel met à jour les onglets et le badge du menu sans recharger ;
 * - « Marquer à relancer » (fiche client, fiche commande) : si une relance est déjà prévue pour ce
 *   client, une fenêtre propose de la décaler (un seul rappel) ou d'en créer une seconde.
 * Tout se passe dans la boutique du compte d'audit, avec un client dédié ; les rappels créés sont
 * supprimés à la fin de chaque passage.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const CUSTOMER = 'Audit Relance';
const TITLE = 'Audit rappel';
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const hidden = (locator) => locator.first().waitFor({ state: 'hidden', timeout: 8000 }).then(() => true, () => false);

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Client dédié (créé au premier passage) et une commande en cours à son nom. */
async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER } });
  const order = await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: 'Audit rappels', quantity: 1, unit_price: '5.00' }] },
  });
  return { customer, order };
}

/** Supprime les rappels d'audit et ceux du client dédié. */
async function cleanup(page, customer) {
  for (const scope of ['todo', 'upcoming', 'done']) {
    for (const r of await allResults(page, `reminders/?scope=${scope}`)) {
      if (r.title.startsWith(TITLE) || r.customer === customer.id) await api(page, `reminders/${r.id}/`, { method: 'DELETE' });
    }
  }
}

const counts = async (page) => ({
  badge: (await api(page, 'dashboard/badges/')).reminders_due ?? 0,
  dashboard: (await api(page, 'dashboard/today/')).today_reminders.count,
});

/** Badge « Rappels » du menu latéral (desktop) : le nombre affiché, 0 sans badge. */
async function sidebarBadge(page) {
  const link = page.locator('aside a[href="/reminders"]').filter({ visible: true }).first();
  const text = await link.innerText().catch(() => '');
  return Number(text.match(/\d+/)?.[0] ?? 0);
}

async function checkCounts(page, ctx) {
  const { label, locale, viewport } = ctx;
  const due = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
  await api(page, 'reminders/', { method: 'POST', data: { title: `${TITLE} en retard`, due_at: due(-2) } });
  await api(page, 'reminders/', { method: 'POST', data: { title: `${TITLE} à venir`, due_at: due(3) } });
  const { badge, dashboard } = await counts(page);
  await goto(page, '/reminders');
  const todoTab = (count) => visibleButton(page, fmt(locale, 'reminders.tab_todo', { count }));
  const sidebarOk = async (count) => {
    for (let i = 0; i < 16 && !viewport.mobile; i += 1) {
      if (await sidebarBadge(page) === count) return true;
      await page.waitForTimeout(500);
    }
    return viewport.mobile;
  };
  report.check(badge === dashboard && await shown(todoTab(badge)) && await sidebarOk(badge),
    `${label} : « À faire » = badge = accueil (${badge})`);

  await page.getByRole('button').filter({ hasText: `${TITLE} en retard` }).first().click();
  await visibleButton(page, msg(locale, 'reminders.mark_done')).click();
  const after = badge - 1;
  report.check(await shown(todoTab(after)) && await sidebarOk(after) && (await counts(page)).badge === after,
    `${label} : terminé → « À faire » et badge du menu à ${after}, sans recharger`);

  const upcomingTab = fmt(locale, 'reminders.tab_upcoming', { count: 0 });
  await page.getByRole('button').filter({ visible: true, hasText: new RegExp(`^${upcomingTab}`) }).first().click();
  const upcoming = page.getByRole('button').filter({ hasText: `${TITLE} à venir` });
  report.check(await shown(upcoming), `${label} : « À venir » liste le rappel à venir`);
  await upcoming.first().click();
  await visibleButton(page, msg(locale, 'reminders.delete')).click();
  await page.getByRole('dialog').getByRole('button', { name: msg(locale, 'reminders.confirm_delete_cta'), exact: true }).click();
  report.check(await hidden(page.getByRole('button').filter({ hasText: `${TITLE} à venir` })),
    `${label} : supprimé → retiré de « À venir » sans recharger`);
}

/** Ouvre le menu « ⋯ » et choisit « Marquer à relancer ». */
async function scheduleFromMenu(page, ctx, key) {
  await visibleButton(page, msg(ctx.locale, 'ui.detail.more_actions')).first().click();
  const items = ctx.viewport.mobile ? page.getByRole('dialog').getByRole('button') : page.getByRole('menuitem');
  await items.filter({ hasText: msg(ctx.locale, key) }).first().click();
}

const pendingFollowups = async (page, customer) =>
  (await api(page, `reminders/?customer=${customer.id}&category=customer_followup`)).results;

async function checkFollowup(page, ctx, { customer, order }) {
  const { label, locale } = ctx;
  const f = (key) => msg(locale, `reminders.followup.${key}`);
  const toast = (key) => page.locator('[data-sonner-toast]').filter({ hasText: f(key).split('{')[0].trim() });
  await goto(page, `/customers/${customer.id}`);
  await scheduleFromMenu(page, ctx, 'customers.detail.reminder_schedule');
  report.check(await shown(toast('created')) && (await pendingFollowups(page, customer)).length === 1,
    `${label} : fiche client, « Marquer à relancer » → rappel créé`);

  const dialog = page.getByRole('dialog').filter({ hasText: CUSTOMER });
  await scheduleFromMenu(page, ctx, 'customers.detail.reminder_schedule');
  report.check(await shown(dialog), `${label} : fiche client, relance déjà prévue → fenêtre « décaler »`);
  await dialog.getByRole('button', { name: f('postpone'), exact: true }).click();
  report.check(await hidden(dialog) && (await pendingFollowups(page, customer)).length === 1,
    `${label} : « ${f('postpone')} » → toujours un seul rappel de relance`);

  await goto(page, `/orders/${order.id}`);
  await scheduleFromMenu(page, ctx, 'orders.detail.reminder_schedule');
  report.check(await shown(dialog), `${label} : fiche commande, relance déjà prévue → fenêtre « décaler »`);
  await dialog.getByRole('button', { name: f('create_anyway'), exact: true }).click();
  const followups = await hidden(dialog) ? await pendingFollowups(page, customer) : [];
  report.check(followups.length === 2 && followups.some((r) => r.order === order.id),
    `${label} : « ${f('create_anyway')} » → second rappel, lié à la commande`);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const data = await setup(page);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const run = { label, locale, viewport };
      try {
        await cleanup(page, data.customer);
        await checkCounts(page, run);
        await checkFollowup(page, run, data);
      } catch (error) {
        report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
      }
      const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await cleanup(page, data.customer);
  await api(page, `orders/${data.order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
  await ctx.close();
}
await browser.close();
report.finish();
