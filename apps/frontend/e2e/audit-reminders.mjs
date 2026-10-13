/**
 * Audit des rappels, à 1440px et 360px, en clair et en sombre, en français et en arabe :
 * - l'onglet « À faire » donne le même chiffre que le badge du menu et l'accueil (API) ;
 * - la case ronde termine le rappel (onglet et badge du menu mis à jour sans recharger),
 *   « Annuler » de la notification le rouvre ;
 * - « Reporter » → « Demain à 9 h » le fait passer dans « À venir » ;
 * - « Relancer » ouvre le message WhatsApp préparé pour le client (« Nadia Relance », commande impayée) ;
 * - interrupteur « Relancer les impayés » des rappels automatiques (remis en place par l'API) ;
 * - suppression avec confirmation ;
 * - attribution (1440px) : un rappel pour l'employé n'entre que dans son badge, un rappel pour
 *   toute l'équipe entre dans celui de chacun ;
 * - « Marquer à relancer » (fiche client, fiche commande) : si une relance est déjà prévue pour ce
 *   client, une fenêtre propose de la décaler (un seul rappel) ou d'en créer une seconde.
 * Tout se passe dans la boutique du compte d'audit ; les rappels créés sont supprimés à la fin de
 * chaque passage.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const CUSTOMER = 'Audit Relance';
const FOLLOWUP_CUSTOMER = 'Nadia Relance';
const STAFF_EMAIL = 'e2e-staff@example.com';
const TITLE = 'Audit rappel';
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const hidden = (locator) => locator.first().waitFor({ state: 'hidden', timeout: 8000 }).then(() => true, () => false);
const L = (locale, key, params) => (params ? fmt(locale, `reminders.list.${key}`, params) : msg(locale, `reminders.list.${key}`));
const due = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
const remind = (page, data) => api(page, 'reminders/', { method: 'POST', data: { category: 'free', ...data } });

/** Relit `read` jusqu'à obtenir `expected` (8 s au plus). */
async function eventually(read, expected) {
  for (let i = 0; i < 16; i += 1) {
    if (await read() === expected) return true;
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
  return false;
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Client dédié (créé au premier passage) et une commande en cours à son nom ; client à relancer du seed. */
async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER } });
  const order = await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: 'Audit rappels', quantity: 1, unit_price: '5.00' }] },
  });
  const nadia = (await allResults(page, `customers/?search=${encodeURIComponent(FOLLOWUP_CUSTOMER)}`))
    .find((c) => c.display_name === FOLLOWUP_CUSTOMER);
  const unpaid = (await api(page, `orders/?customer=${nadia.id}&due=true`)).results[0];
  return { customer, order, nadia, unpaid };
}

/** Supprime les rappels d'audit et ceux du client dédié. */
async function cleanup(page, customer) {
  for (const scope of ['todo', 'upcoming', 'done']) {
    for (const r of await allResults(page, `reminders/?scope=${scope}`)) {
      if (r.title.startsWith(TITLE) || r.customer === customer.id) await api(page, `reminders/${r.id}/`, { method: 'DELETE' });
    }
  }
}

const badgeOf = async (page) => (await api(page, 'dashboard/badges/')).reminders_due ?? 0;
const counts = async (page) => ({
  badge: await badgeOf(page),
  dashboard: (await api(page, 'dashboard/today/')).today_reminders.count,
});

/** Badge « Rappels » du menu latéral (desktop) : le nombre affiché, 0 sans badge. */
async function sidebarBadge(page) {
  const link = page.locator('aside a[href="/reminders"]').filter({ visible: true }).first();
  const text = await link.innerText().catch(() => '');
  return Number(text.match(/\d+/)?.[0] ?? 0);
}

/** Nombre affiché dans l'onglet (À faire, À venir, Terminés). */
async function tabCount(page, locale, tab) {
  const el = page.getByRole('tab').filter({ visible: true, hasText: L(locale, `tab.${tab}`) }).first();
  const text = await el.innerText().catch(() => '');
  return Number(text.match(/\d+/)?.[0] ?? -1);
}

const tabIs = (page, locale, tab, count) => eventually(() => tabCount(page, locale, tab), count);
const sidebarIs = (page, viewport, count) => (viewport.mobile ? true : eventually(() => sidebarBadge(page), count));
const row = (page, title) => page.locator('li').filter({ visible: true, hasText: title });

async function openTab(page, locale, tab) {
  await page.getByRole('tab').filter({ visible: true, hasText: L(locale, `tab.${tab}`) }).first().click();
}

/** Action d'une ligne : boutons et menu « ⋯ » sur desktop, tout par la feuille « ⋯ » sur mobile. */
async function rowAction(page, ctx, title, key) {
  const { locale, viewport } = ctx;
  const more = page.getByRole('button', { name: L(locale, 'more_aria', { title }), exact: true }).filter({ visible: true });
  if (viewport.mobile) {
    await more.click();
    await page.getByRole('dialog').getByRole('button', { name: L(locale, key), exact: true }).click();
    return;
  }
  if (key === 'follow_up' || key === 'postpone') {
    await visibleButton(page, L(locale, `${key}_aria`, { title })).click();
    return;
  }
  await more.click();
  await page.getByRole('menuitem').filter({ hasText: L(locale, key) }).first().click();
}

async function postpone(page, ctx, title, option) {
  await rowAction(page, ctx, title, 'postpone');
  const name = L(ctx.locale, `postpone_option.${option}`);
  const choice = ctx.viewport.mobile
    ? page.getByRole('dialog').getByRole('button', { name, exact: true })
    : page.getByRole('menuitem', { name, exact: true });
  await choice.click();
}

async function checkCounts(page, ctx) {
  const { label, locale, viewport } = ctx;
  const overdue = `${TITLE} en retard`;
  await remind(page, { title: overdue, due_at: due(-48) });
  await remind(page, { title: `${TITLE} à venir`, due_at: due(72) });
  const { badge, dashboard } = await counts(page);
  await goto(page, '/reminders');
  report.check(badge === dashboard && await tabIs(page, locale, 'todo', badge) && await sidebarIs(page, viewport, badge),
    `${label} : « À faire » = badge = accueil (${badge})`);

  await page.getByRole('checkbox', { name: L(locale, 'done_aria', { title: overdue }), exact: true }).click();
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: L(locale, 'done_toast', { title: overdue }) });
  report.check(await shown(toast) && await tabIs(page, locale, 'todo', badge - 1) && await sidebarIs(page, viewport, badge - 1)
    && (await counts(page)).badge === badge - 1,
  `${label} : case cochée → terminé, « À faire » et badge du menu à ${badge - 1}, sans recharger`);
  await toast.getByRole('button', { name: L(locale, 'undo'), exact: true }).click();
  report.check(await tabIs(page, locale, 'todo', badge) && await sidebarIs(page, viewport, badge) && await shown(row(page, overdue)),
    `${label} : « ${L(locale, 'undo')} » → rouvert, de retour dans « À faire »`);

  await postpone(page, ctx, overdue, 'tomorrow');
  const moved = await hidden(row(page, overdue)) && await tabIs(page, locale, 'todo', badge - 1);
  await openTab(page, locale, 'upcoming');
  report.check(moved && await shown(row(page, overdue)),
    `${label} : « ${L(locale, 'postpone_option.tomorrow')} » → passe dans « À venir »`);

  await rowAction(page, ctx, `${TITLE} à venir`, 'delete');
  const dialog = page.getByRole('dialog').filter({ hasText: L(locale, 'delete_confirm', { title: `${TITLE} à venir` }) });
  await dialog.getByRole('button', { name: L(locale, 'delete'), exact: true }).click();
  report.check(await hidden(row(page, `${TITLE} à venir`)) && await hidden(dialog),
    `${label} : supprimé après confirmation → retiré de « À venir » sans recharger`);
}

async function checkFollowUpFromList(page, ctx, { nadia, unpaid }) {
  const { label, locale } = ctx;
  const title = `${TITLE} relance`;
  await remind(page, { title, due_at: due(-1), category: 'unpaid', customer: nadia.id, order: unpaid.id });
  await goto(page, '/reminders');
  await rowAction(page, ctx, title, 'follow_up');
  const message = page.getByRole('textbox', { name: msg(locale, 'messages.prepared.message_label') });
  const ok = await shown(message) && (await message.inputValue()).includes(unpaid.order_number);
  report.check(ok, `${label} : « ${L(locale, 'follow_up')} » → message WhatsApp préparé pour la commande ${unpaid.order_number}`);
  await page.keyboard.press('Escape');
  await hidden(message);
}

async function checkAutomatic(page, ctx) {
  const { label, locale, viewport } = ctx;
  const a = (key) => msg(locale, `reminders.auto.${key}`);
  await goto(page, '/reminders');
  if (viewport.mobile) {
    await page.locator('button[aria-expanded]').filter({ visible: true, hasText: a('title') }).click();
  }
  const toggle = page.getByRole('switch', { name: a('unpaid_label'), exact: true });
  const enabled = async () => (await api(page, 'reminders/settings/')).unpaid_followup_enabled;
  await toggle.click();
  const off = await eventually(() => toggle.getAttribute('aria-checked'), 'false') && await eventually(enabled, false);
  await api(page, 'reminders/settings/', { method: 'PATCH', data: { unpaid_followup_enabled: true } });
  report.check(off, `${label} : interrupteur « ${a('unpaid_label')} » → désactivé (puis remis par l'API)`);
}

/** Rappel pour l'employé : dans son badge seulement ; rappel pour l'équipe : dans le badge de chacun. */
async function checkAssignment(browser, page, viewport) {
  const staff = await openSession(browser, viewport, { email: STAFF_EMAIL });
  try {
    const staffMember = (await api(staff.page, 'reminders/assignees/')).find((m) => m.is_me);
    const before = { owner: await badgeOf(page), staff: await badgeOf(staff.page) };
    await remind(page, { title: `${TITLE} pour l'employé`, due_at: due(-1), assigned_to: staffMember.id });
    const after = { owner: await badgeOf(page), staff: await badgeOf(staff.page) };
    await goto(staff.page, '/reminders?for=me');
    report.check(after.owner === before.owner && after.staff === before.staff + 1
      && await sidebarIs(staff.page, viewport, after.staff) && await tabIs(staff.page, 'fr', 'todo', after.staff),
    `${viewport.name}px : rappel pour l'employé → badge de l'employé à ${after.staff}, propriétaire inchangé (${after.owner})`);

    await remind(page, { title: `${TITLE} pour l'équipe`, due_at: due(-1) });
    const team = { owner: await badgeOf(page), staff: await badgeOf(staff.page) };
    await goto(staff.page, '/reminders?for=me');
    report.check(team.owner === after.owner + 1 && team.staff === after.staff + 1 && await shown(row(staff.page, `${TITLE} pour l'équipe`)),
      `${viewport.name}px : rappel pour toute l'équipe → dans le badge de chacun`);
    const problems = staff.watch.problems;
    report.check(problems.length === 0, `${viewport.name}px employé : console propre${problems.map((p) => `\n      ${p}`).join('')}`);
  } finally {
    await staff.ctx.close();
  }
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
        await checkFollowUpFromList(page, run, data);
        await checkAutomatic(page, run);
        await checkFollowup(page, run, data);
        if (locale === 'fr' && theme === 'light') {
          await cleanup(page, data.customer);
          await checkAssignment(browser, page, viewport);
        }
      } catch (error) {
        report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
      }
      const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
      report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await cleanup(page, data.customer);
  await api(page, 'reminders/settings/', { method: 'PATCH', data: { unpaid_followup_enabled: true } });
  await api(page, `orders/${data.order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
  await ctx.close();
}
await browser.close();
report.finish();
