/**
 * Audit du fuseau des rappels, à 1440px et 360px : l'appareil est réglé sur un fuseau dont la date
 * diffère de celle de la boutique (Kiritimati, UTC+14, ou Pago Pago, UTC−11, selon l'heure).
 * - formulaire : « Aujourd'hui 18:00 » remplit la date et l'heure de la boutique, et le rappel est
 *   enregistré à 18:00 heure de la boutique ;
 * - « Reporter » → « Demain à 9 h » : 9:00 le lendemain, heure de la boutique.
 * Rappels d'audit supprimés à la fin de chaque passage.
 */
import { BASE, VIEWPORTS, createReport, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, allResults } from './lib/products.mjs';
import { textbox, visibleButton } from './lib/form.mjs';

const report = createReport();
const TITLE = 'Audit fuseau';
const DAY = 86_400_000;
// Boutique d'audit en France (seed).
const SHOP_ZONE = 'Europe/Paris';
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const f = (key) => msg('fr', `reminders.form.${key}`);
const L = (key, params) => (params ? fmt('fr', `reminders.list.${key}`, params) : msg('fr', `reminders.list.${key}`));

/** « 2026-10-14 » et « 18:00 » : date et heure affichées dans le fuseau `timeZone` à l'instant `d`. */
function wall(d, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Fuseau d'appareil où l'on n'est pas le même jour que la boutique. */
function deviceZone(shopZone) {
  for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    if (wall(new Date(), zone).date !== wall(new Date(), shopZone).date) return zone;
  }
  throw new Error('aucun fuseau d\'appareil à une autre date que la boutique');
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
}

async function cleanup(page) {
  for (const scope of ['todo', 'upcoming', 'done']) {
    for (const r of await allResults(page, `reminders/?scope=${scope}`)) {
      if (r.title.startsWith(TITLE)) await api(page, `reminders/${r.id}/`, { method: 'DELETE' });
    }
  }
}

const findReminder = async (page, title) => (await allResults(page, `reminders/?scope=upcoming&search=${encodeURIComponent(title)}`))
  .concat(await allResults(page, `reminders/?scope=todo&search=${encodeURIComponent(title)}`))
  .find((r) => r.title === title);

/** Raccourci « Aujourd'hui 18:00 » du formulaire. */
async function checkShortcut(page, ctx) {
  const { label, shopZone } = ctx;
  const title = `${TITLE} raccourci ${ctx.viewport.name}`;
  const today = wall(new Date(), shopZone).date;
  await goto(page, '/reminders/new');
  await textbox(page, f('title')).fill(title);
  const shortcut = page.locator('form fieldset').getByRole('button')
    .filter({ hasText: fmt('fr', 'reminders.form.shortcut', { key: 'today', time: '' }).trim() });
  await shortcut.click();
  const inputs = { date: await page.locator('input[type="date"]').inputValue(), time: await page.locator('input[type="time"]').inputValue() };
  report.check(inputs.date === today && inputs.time === '18:00' && (await shortcut.innerText()).includes('18:00'),
    `${label} : « ${await shortcut.innerText()} » → ${inputs.date} ${inputs.time} (date de la boutique : ${today})`);
  await visibleButton(page, f('submit_create')).click();
  await page.waitForURL((u) => u.pathname === '/reminders');
  const saved = await findReminder(page, title);
  const at = saved && wall(new Date(saved.due_at), shopZone);
  report.check(at?.date === today && at.time === '18:00',
    `${label} : enregistré à ${at ? `${at.date} ${at.time}` : '—'}, heure de la boutique (attendu ${today} 18:00)`);
}

/** « Reporter » → « Demain à 9 h » d'un rappel en retard. */
async function checkPostpone(page, ctx) {
  const { label, shopZone, viewport } = ctx;
  const title = `${TITLE} reporté ${viewport.name}`;
  const tomorrow = wall(new Date(Date.now() + DAY), shopZone).date;
  const created = await api(page, 'reminders/', {
    method: 'POST', data: { title, category: 'free', due_at: new Date(Date.now() - 2 * DAY).toISOString() },
  });
  await goto(page, '/reminders');
  await shown(page.locator('li').filter({ visible: true, hasText: title }));
  const name = L('postpone_option.tomorrow');
  if (viewport.mobile) {
    await page.getByRole('button', { name: L('more_aria', { title }), exact: true }).filter({ visible: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: L('postpone'), exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  } else {
    await visibleButton(page, L('postpone_aria', { title })).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
  let at;
  for (let i = 0; i < 16 && at?.time !== '09:00'; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 500); });
    at = wall(new Date((await api(page, `reminders/${created.id}/`)).due_at), shopZone);
  }
  report.check(at?.date === tomorrow && at.time === '09:00',
    `${label} : « ${name} » → ${at ? `${at.date} ${at.time}` : '—'}, heure de la boutique (attendu ${tomorrow} 09:00)`);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  console.log(`\n=== ${viewport.name}px`);
  // Fuseau de l'appareil fixé à l'ouverture du contexte, donc avant de lire celui de la boutique.
  const deviceTz = deviceZone(SHOP_ZONE);
  const session = await openSession(browser, viewport, { timezoneId: deviceTz });
  const { page, watch } = session;
  const shopZone = (await api(page, 'shop/')).timezone;
  const ctx = { viewport, shopZone, label: `${viewport.name}px appareil ${deviceTz}, boutique ${shopZone}` };
  await cleanup(page);
  try {
    report.check(shopZone === SHOP_ZONE
      && await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone) === deviceTz,
    `${ctx.label} : l'appareil n'est pas le même jour que la boutique`);
    await checkShortcut(page, ctx);
    await checkPostpone(page, ctx);
  } finally {
    await cleanup(page);
  }
  report.check(watch.problems.length === 0, `${viewport.name}px : console et défilement propres${watch.problems.map((p) => `\n      ${p}`).join('')}`);
  await session.ctx.close();
}
await browser.close();
report.finish();
