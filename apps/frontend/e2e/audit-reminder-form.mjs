/**
 * Audit du formulaire de rappel (gabarit v3), création et modification, à 1440px et 360px, en clair
 * et en sombre, en français et en arabe :
 * - disposition : Rappel, Notes | Lié à, Pour qui ; sur mobile, cartes empilées, facultatives repliées ;
 * - titre vide → erreur et focus ; raccourci « Aujourd'hui, 18:00 » coché ; catégorie « Préparation » ;
 *   client choisi dans la liste, commande parmi ses commandes non soldées, attribué à l'employé ;
 *   « Créer le rappel » → notification, rappel enregistré avec ces valeurs ;
 * - modification : « Enregistrer » inactif tant que rien ne change, puis enregistré ; ⋯ → « Marquer
 *   comme terminé » ; ⋯ → « Supprimer » avec confirmation ;
 * - fiches client et commande : carte « Rappels », « Ajouter » ouvre le formulaire pré-rempli ; une
 *   relance client déjà prévue propose de la décaler (un seul rappel) ;
 * - « Annuler » avec des modifications : « quitter sans enregistrer » demandé.
 * Tout se passe dans la boutique du compte d'audit ; les rappels créés sont supprimés à la fin,
 * la commande annulée.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { isFocused, layoutOk, openCard, textbox, visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const CUSTOMER = 'Audit Formulaire Rappel';
const TITLE = 'Audit formulaire';
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const hidden = (locator) => locator.first().waitFor({ state: 'hidden', timeout: 8000 }).then(() => true, () => false);
const toast = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text });

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Client dédié (créé au premier passage) avec une commande impayée ; l'employé du compte d'audit. */
async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER } });
  const order = await api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: 'Audit formulaire', quantity: 1, unit_price: '7.00' }] },
  });
  const staff = (await api(page, 'reminders/assignees/')).find((m) => !m.is_me);
  return { customer, order, staff };
}

async function cleanup(page, customer) {
  for (const scope of ['todo', 'upcoming', 'done']) {
    for (const r of await allResults(page, `reminders/?scope=${scope}`)) {
      if (r.title.startsWith(TITLE) || r.customer === customer.id) await api(page, `reminders/${r.id}/`, { method: 'DELETE' });
    }
  }
}

const findReminder = async (page, title) =>
  (await allResults(page, `reminders/?scope=upcoming&search=${encodeURIComponent(title)}`))
    .concat(await allResults(page, `reminders/?scope=todo&search=${encodeURIComponent(title)}`))
    .find((r) => r.title === title);

/** Choix dans un menu du formulaire (FormSelect) : ouvre la carte sur mobile, puis l'option. */
async function choose(page, label, text) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option').filter({ hasText: text }).first().click();
}

async function auditCreate(page, ctx, { customer, order, staff }) {
  const { label, locale } = ctx;
  const f = (key) => msg(locale, `reminders.form.${key}`);
  await goto(page, '/reminders/new');
  const titles = ['section_main', 'section_notes', 'section_link', 'section_assignee'].map(f);
  report.check(await layoutOk(page, ctx, { order: titles, side: [titles[2], titles[3]] })
    && await shown(page.getByText(msg(locale, 'reminders.new.subtitle'), { exact: true })),
  `${label} : création, ${ctx.viewport.mobile ? 'cartes empilées, facultatives repliées' : 'deux colonnes (Lié à, Pour qui à côté)'}`);

  const submit = visibleButton(page, f('submit_create'));
  await submit.click();
  const title = textbox(page, f('title'));
  report.check(await shown(page.getByText(f('title_required'), { exact: true })) && await isFocused(title),
    `${label} : titre vide → « ${f('title_required')} », focus sur le titre`);

  const name = `${TITLE} ${locale} ${ctx.theme}`;
  await title.fill(name);
  // Heure affichée selon la langue : le raccourci est reconnu à son début (« Aujourd'hui, »).
  const today = page.locator('form fieldset').getByRole('button')
    .filter({ hasText: fmt(locale, 'reminders.form.shortcut', { key: 'today', time: '' }).trim() });
  await today.click();
  await page.getByRole('radiogroup', { name: f('category') }).getByText(fmt(locale, 'reminders.category', { value: 'order_prep' }), { exact: true }).click();
  report.check((await today.getAttribute('aria-pressed')) === 'true', `${label} : raccourci « ${await today.innerText()} » coché`);

  await openCard(page, ctx, f('section_link'));
  await page.getByRole('button', { name: f('customer'), exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('searchbox').fill(CUSTOMER);
  await sheet.getByRole('button').filter({ hasText: CUSTOMER }).first().click();
  await hidden(sheet);
  await choose(page, f('order'), order.order_number);
  if (staff) {
    await openCard(page, ctx, f('section_assignee'));
    await choose(page, f('assignee'), staff.full_name);
  }
  await submit.click();
  const toasted = await shown(toast(page, f('toast_created')));
  const saved = await findReminder(page, name);
  report.check(toasted && page.url().endsWith('/reminders'),
    `${label} : formulaire ouvert directement → retour à la liste, « ${f('toast_created')} » affiché`);
  report.check(Boolean(saved) && saved.customer === customer.id && saved.order === order.id && saved.category === 'order_prep'
    && saved.assigned_to === (staff?.id ?? null) && !page.url().includes('/reminders/new'),
  `${label} : « ${f('submit_create')} » → client, commande, catégorie${staff ? ', employé' : ''} enregistrés`);
  return saved;
}

async function auditEdit(page, ctx, reminder) {
  const { label, locale } = ctx;
  const f = (key) => msg(locale, `reminders.form.${key}`);
  const l = (key) => msg(locale, `reminders.list.${key}`);
  await goto(page, `/reminders/${reminder.id}/edit`);
  const submit = visibleButton(page, f('submit_edit'));
  report.check(await submit.isDisabled(), `${label} : modification, « ${f('submit_edit')} » inactif sans changement`);
  const renamed = `${reminder.title} modifié`;
  await textbox(page, f('title')).fill(renamed);
  await submit.click();
  report.check(await shown(toast(page, f('toast_saved'))) && (await api(page, `reminders/${reminder.id}/`)).title === renamed,
    `${label} : « ${f('submit_edit')} » → titre enregistré`);

  await goto(page, `/reminders/${reminder.id}/edit`);
  const menu = async (key) => {
    await visibleButton(page, msg(locale, 'ui.detail.more_actions')).first().click();
    const items = ctx.viewport.mobile ? page.getByRole('dialog').getByRole('button') : page.getByRole('menuitem');
    await items.filter({ hasText: l(key) }).first().click();
  };
  await menu('mark_done');
  report.check(await shown(toast(page, fmt(locale, 'reminders.list.done_toast', { title: renamed })))
    && (await api(page, `reminders/${reminder.id}/`)).status === 'done',
  `${label} : ⋯ → « ${l('mark_done')} »`);
  await menu('delete');
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: renamed });
  await confirm.getByRole('button', { name: l('delete'), exact: true }).click();
  report.check(await shown(toast(page, l('deleted_toast'))) && await page.waitForURL((url) => !url.pathname.endsWith('/edit')).then(() => true, () => false),
    `${label} : ⋯ → « ${l('delete')} » avec confirmation, retour à la liste`);
}

/** Carte « Rappels » des fiches ; relance déjà prévue → « décaler » ; garde « quitter sans enregistrer ». */
async function auditDetailCards(page, ctx, { customer, order }) {
  const { label, locale } = ctx;
  const f = (key) => msg(locale, `reminders.form.${key}`);
  const due = new Date(Date.now() + 48 * 3_600_000).toISOString();
  const linked = await api(page, 'reminders/', {
    method: 'POST', data: { title: `${TITLE} commande`, due_at: due, category: 'unpaid', customer: customer.id, order: order.id },
  });
  await goto(page, `/orders/${order.id}`);
  // Le rappel n'apparaît, sur la fiche, que dans la carte « Rappels ».
  const link = page.getByRole('link', { name: linked.title, exact: true });
  report.check(await shown(page.getByRole('heading', { name: msg(locale, 'reminders.card.title'), exact: true })) && await shown(link),
    `${label} : fiche commande, carte « Rappels »`);
  await page.getByRole('checkbox', { name: fmt(locale, 'reminders.list.done_aria', { title: linked.title }) }).click();
  report.check(await hidden(link), `${label} : case ronde de la carte → rappel terminé`);

  await api(page, 'reminders/', {
    method: 'POST', data: { title: `${TITLE} relance`, due_at: due, category: 'customer_followup', customer: customer.id },
  });
  await goto(page, `/customers/${customer.id}`);
  await page.getByRole('link', { name: msg(locale, 'reminders.card.add_cta'), exact: true }).click();
  await page.waitForURL(/\/reminders\/new\?customer=/);
  await page.waitForLoadState('networkidle');
  await openCard(page, ctx, f('section_link'));
  report.check(await shown(page.getByRole('button', { name: f('customer'), exact: true }).filter({ hasText: CUSTOMER })), `${label} : « Ajouter » depuis la fiche client → client pré-rempli`);

  await textbox(page, f('title')).fill(`${TITLE} relance bis`);
  // Garde « quitter sans enregistrer » : refusée, le formulaire reste ouvert.
  let asked = false;
  page.once('dialog', (dialog) => { asked = true; void dialog.dismiss(); });
  // Mobile : on quitte par le retour de l'en-tête (« Annuler » n'y est pas affiché).
  const leave = msg(locale, ctx.viewport.mobile ? 'layout.common.back' : 'ui.form.cancel');
  await visibleButton(page, leave).click();
  report.check(asked && page.url().includes('/reminders/new'), `${label} : « ${leave} » avec des modifications → « quitter sans enregistrer » demandé`);

  await page.getByRole('radiogroup', { name: f('category') })
    .getByText(fmt(locale, 'reminders.category', { value: 'customer_followup' }), { exact: true }).click();
  await visibleButton(page, f('submit_create')).click();
  const dialog = page.getByRole('dialog').filter({ hasText: CUSTOMER });
  report.check(await shown(dialog), `${label} : relance déjà prévue pour ce client → fenêtre « décaler »`);
  await dialog.getByRole('button', { name: msg(locale, 'reminders.followup.postpone'), exact: true }).click();
  const followups = await hidden(dialog)
    ? (await api(page, `reminders/?customer=${customer.id}&category=customer_followup`)).results : [];
  report.check(followups.length === 1 && page.url().includes(`/customers/${customer.id}`),
    `${label} : « ${msg(locale, 'reminders.followup.postpone')} » → un seul rappel de relance, retour à la fiche`);
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
      const run = { label, viewport, locale, theme };
      try {
        await cleanup(page, data.customer);
        const created = await auditCreate(page, run, data);
        if (created) await auditEdit(page, run, created);
        await auditDetailCards(page, run, data);
      } catch (error) {
        report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
      }
      // Le 400 du titre vide n'atteint pas le serveur : aucune erreur attendue dans la console.
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
