/**
 * Audit des listes longues d'une fiche (design_principles §4), à 1440px et 360px, en clair et en sombre,
 * en français et en arabe, sur une fiche client à 7 notes (donc 7 activités) :
 * - « Activité » et « Notes » affichent 5 éléments, puis « Voir plus (2 restantes) » ;
 * - un clic charge la suite : 7 éléments, plus de bouton ;
 * - la puce « Notes » de l'activité repart de 5 et garde « Voir plus » (filtre et pagination ensemble) ;
 * - le serveur ne renvoie qu'une fenêtre : première requête en `limit=5`.
 * Données : un client « Audit Voir plus » et ses 7 notes, créés au besoin (l'audit reste relançable).
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { api, allResults } from './lib/products.mjs';

const report = createReport();
const CUSTOMER = 'Audit Voir plus';
const NOTE = 'Audit voir plus n°';
const NOTES = 7;

async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER } });
  const notes = await allResults(page, `notes/?customer=${customer.id}`);
  for (let i = notes.length + 1; i <= NOTES; i += 1) {
    await api(page, 'notes/', { method: 'POST', data: { customer: customer.id, content: `${NOTE}${i}` } });
  }
  return customer;
}

/** Carte titrée (SectionCard la plus proche du titre). */
function card(page, title) {
  return page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).last();
}

/** Éléments de la carte (notes reconnues à leur texte) et bouton « Voir plus » qu'elle affiche. */
async function state(section, more) {
  const items = await section.getByText(NOTE).filter({ visible: true }).count();
  return { items, shown: await section.getByRole('button', { name: more, exact: true }).isVisible() };
}

/** 5 éléments et « Voir plus (2 …) », puis 7 éléments sans bouton après un clic. */
async function checkCard(section, more, label) {
  const button = section.getByRole('button', { name: more, exact: true });
  await button.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  const before = await state(section, more);
  if (before.shown) {
    await button.click();
    await button.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  }
  const after = await state(section, more);
  report.check(
    before.items === 5 && before.shown && after.items === NOTES && !after.shown,
    `${label} : 5 éléments et « ${more} », puis ${NOTES} sans bouton (${before.items} → ${after.items})`,
  );
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const customer = await setup(page);
    const windows = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith(`/customers/${customer.id}/activity/`)) windows.push(url.searchParams.get('limit'));
    });
    for (const locale of ['fr', 'ar']) {
      for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
        console.log(`\n=== ${label}`);
        await setLocale(locale);
        setTheme(theme);
        watch.setLabel(label);
        const before = watch.problems.length;
        const t = (key) => msg(locale, key);
        try {
          windows.length = 0;
          await page.goto(`${BASE}/customers/${customer.id}`);
          await page.waitForLoadState('networkidle');
          const activity = card(page, t('customers.timeline.title'));
          const more = (kind) => fmt(locale, 'ui.show_more.more', { kind, remaining: NOTES - 5 });
          await checkCard(activity, more('activities'), `${label} : « ${t('customers.timeline.title')} »`);
          report.check(windows[0] === '5', `${label} : première requête de l'activité en limit=5 (${windows.join(', ')})`);
          await activity.getByRole('button', { name: t('customers.timeline.chip_notes'), exact: true }).click();
          await page.waitForLoadState('networkidle');
          await checkCard(activity, more('activities'), `${label} : puce « ${t('customers.timeline.chip_notes')} »`);
          await checkCard(card(page, t('ui.notes.title')), more('notes'), `${label} : « ${t('ui.notes.title')} »`);
        } catch (error) {
          report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
        }
        const problems = watch.problems.slice(before);
        report.check(problems.length === 0, `${label} : console propre, défilement jamais bloqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
