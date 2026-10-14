/**
 * Audit du module « Rappels » d'un employé, à 1440px et 360px :
 * - sans le module : ni lien ni badge « Rappels » dans le menu, page « Accès refusé », API refusée,
 *   pas de carte Rappels sur une fiche client, absent du menu « Pour » ;
 * - le propriétaire lui donne le module depuis la page Équipe (libellé « Rappels ») ;
 * - avec le module : proposé dans « Pour qui », un rappel attribué depuis le formulaire entre dans
 *   son badge et dans « Pour moi », il peut en créer un.
 * Employé de la boutique d'audit (Inès Martin, e2e-staff@example.com) : sara est dans la boutique de
 * démo, que les audits ne modifient pas. Il retrouve le module à la fin, rappels d'audit supprimés.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';
import { openCard, textbox, visibleButton } from './lib/form.mjs';

const report = createReport();
const nested = [];
const STAFF_EMAIL = 'e2e-staff@example.com';
const TITLE = 'Audit module';
const SEED_PERMISSIONS = ['orders', 'customers', 'reminders'];
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const hidden = (locator) => locator.first().waitFor({ state: 'hidden', timeout: 8000 }).then(() => true, () => false);
const f = (key) => msg('fr', `reminders.form.${key}`);

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Relit `read` jusqu'à obtenir `expected` (8 s au plus). */
async function eventually(read, expected) {
  for (let i = 0; i < 16; i += 1) {
    if (await read() === expected) return true;
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
  return false;
}

const member = async (page) => (await allResults(page, 'shop/members/')).find((m) => m.user_email === STAFF_EMAIL);
const setPermissions = async (page, m, permissions) =>
  api(page, `shop/members/${m.id}/`, { method: 'PATCH', data: { role: 'staff', permissions } });
const assignable = async (page, m) => (await api(page, 'reminders/assignees/')).some((a) => a.id === m.id);
const badgeOf = async (page) => (await api(page, 'dashboard/badges/')).reminders_due ?? 0;
const sidebarLink = (page) => page.locator('aside a[href="/reminders"]').filter({ visible: true });
const sidebarBadge = async (page) => Number((await sidebarLink(page).first().innerText().catch(() => '')).match(/\d+/)?.[0] ?? 0);
const status = async (page, path) => (await page.request.fetch(`${BASE}/api/proxy/${path}`)).status();

async function cleanup(page) {
  for (const scope of ['todo', 'upcoming', 'done']) {
    for (const r of await allResults(page, `reminders/?scope=${scope}`)) {
      if (r.title.startsWith(TITLE)) await api(page, `reminders/${r.id}/`, { method: 'DELETE' });
    }
  }
}

/** Sans le module : rien des rappels dans l'interface de l'employé, et l'API refuse. */
async function checkWithout(owner, staff, viewport, m) {
  const label = `${viewport.name}px sans le module`;
  const customer = (await api(owner, 'customers/')).results[0];
  await goto(staff, `/customers/${customer.id}`);
  const card = staff.locator('section h2').filter({ hasText: msg('fr', 'reminders.card.title') });
  report.check(await hidden(card) && (viewport.mobile || (await sidebarLink(staff).count()) === 0),
    `${label} : fiche client sans carte « Rappels »${viewport.mobile ? '' : ', pas de lien « Rappels » dans le menu'}`);
  await goto(staff, '/reminders');
  report.check(await shown(staff.getByRole('heading', { name: msg('fr', 'layout.guard.forbidden_title') }))
    && await status(staff, 'reminders/') === 403 && await status(staff, 'reminders/summary/') === 403,
  `${label} : /reminders → « ${msg('fr', 'layout.guard.forbidden_title')} », API des rappels refusée (403)`);
  report.check(!await assignable(owner, m), `${label} : absent du menu « Pour » du propriétaire`);
}

/** Le propriétaire coche « Rappels » dans la fiche de l'employé, page Équipe. */
async function grantFromTeamPage(owner, viewport) {
  const label = `${viewport.name}px page Équipe`;
  const moduleLabel = msg('fr', 'team.modules.reminders');
  await goto(owner, '/settings/team');
  const cardOf = owner.locator('article').filter({ hasText: STAFF_EMAIL });
  await cardOf.getByRole('button', { name: msg('fr', 'team.actions.edit') }).click();
  const sheet = owner.getByRole('dialog');
  const toggle = sheet.getByRole('button', { name: moduleLabel, exact: true });
  report.check(await shown(toggle) && (await toggle.getAttribute('aria-pressed')) === 'false',
    `${label} : module « ${moduleLabel} » proposé, non coché`);
  await toggle.click();
  await visibleButton(sheet, msg('fr', 'team.form.submit_update')).click();
  report.check(await hidden(sheet) && await shown(cardOf.getByText(moduleLabel, { exact: true }))
    && (await member(owner)).permissions.includes('reminders'),
  `${label} : « ${moduleLabel} » coché et enregistré, affiché sur la carte de l'employé`);
}

/** Avec le module : attribution depuis le formulaire, badge et « Pour moi » de l'employé, création. */
async function checkWith(owner, staff, viewport, m) {
  const label = `${viewport.name}px avec le module`;
  report.check(await assignable(owner, m), `${label} : proposé dans « Pour qui »`);
  await goto(staff, '/reminders?for=me');
  const before = await badgeOf(staff);
  const title = `${TITLE} pour ${m.user_full_name}`;
  await goto(owner, '/reminders/new');
  await textbox(owner, f('title')).fill(title);
  await owner.locator('form fieldset').getByRole('button').first().click();
  await openCard(owner, { viewport }, f('section_assignee'));
  await owner.getByRole('combobox', { name: f('assignee'), exact: true }).click();
  await owner.getByRole('option').filter({ hasText: m.user_full_name }).first().click();
  await visibleButton(owner, f('submit_create')).click();
  await owner.waitForURL((u) => u.pathname === '/reminders');

  await goto(staff, '/reminders?for=me');
  const row = staff.locator('li').filter({ visible: true, hasText: title });
  report.check(await shown(row) && await badgeOf(staff) === before + 1
    && (viewport.mobile || await eventually(() => sidebarBadge(staff), before + 1)),
  `${label} : rappel attribué depuis le formulaire → dans « Pour moi »${viewport.mobile ? '' : ' et le badge du menu'} (${before + 1})`);

  const own = await api(staff, 'reminders/', {
    method: 'POST', data: { title: `${TITLE} créé par l'employé`, category: 'free', due_at: new Date(Date.now() + 86_400_000).toISOString() },
  });
  report.check(Boolean(own?.id), `${label} : l'employé crée un rappel`);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  console.log(`\n=== ${viewport.name}px`);
  const owner = await openSession(browser, viewport);
  const m = await member(owner.page);
  await cleanup(owner.page);
  await setPermissions(owner.page, m, ['orders', 'customers']);
  const staff = await openSession(browser, viewport, { email: STAFF_EMAIL });
  try {
    await checkWithout(owner.page, staff.page, viewport, m);
    await grantFromTeamPage(owner.page, viewport);
    await checkWith(owner.page, staff.page, viewport, m);
  } finally {
    await cleanup(owner.page);
    await setPermissions(owner.page, m, SEED_PERMISSIONS);
  }
  for (const [who, session] of [['propriétaire', owner], ['employé', staff]]) {
    const problems = session.watch.problems;
    report.check(problems.length === 0, `${viewport.name}px ${who} : console et défilement propres${problems.map((p) => `\n      ${p}`).join('')}`);
    await session.ctx.close();
  }
}
await browser.close();
report.check(nested.length === 0, `aucun élément interactif imbriqué${[...new Set(nested)].map((n) => `\n      ${n}`).join('')}`);
report.finish();
