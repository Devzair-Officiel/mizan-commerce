/**
 * Audit du bloc Ventes de l'accueil, à 1440px et 360px, en clair et en sombre, en français et en arabe :
 * - les trois périodes (7 jours, 12 mois, depuis le début) : bouton enfoncé, libellé du montant,
 *   tableau équivalent (lecteurs d'écran) avec un point par jour, mois ou semaine renvoyé par l'API ;
 * - la bulle au survol (montant et nombre de commandes du point) et au clavier (Tab jusqu'à la
 *   courbe, puis flèches : la bulle change de point) ;
 * - la période choisie est gardée sur le compte : elle revient après rechargement ;
 * - libellés de l'axe sans chevauchement et pas de défilement horizontal (360px compris).
 * Une commande du jour (client « Audit Ventes ») donne un point non nul ; annulée à la fin.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { nestedInteractive } from './lib/watch.mjs';
import { api, allResults } from './lib/products.mjs';

const report = createReport();
const nested = [];
const CUSTOMER = 'Audit Ventes';
const PERIODS = ['7d', '12m', 'all'];
const S = (locale, key, params) => (params ? fmt(locale, `dashboard.sales.${key}`, params) : msg(locale, `dashboard.sales.${key}`));
const shown = (locator) => locator.first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
const flat = (text) => text.replace(/\s+/g, ' ').trim();

async function setup(page) {
  const found = await allResults(page, `customers/?situation=all&search=${encodeURIComponent(CUSTOMER)}`);
  const customer = found.find((c) => c.display_name === CUSTOMER)
    ?? await api(page, 'customers/', { method: 'POST', data: { name: CUSTOMER } });
  return api(page, 'orders/', {
    method: 'POST',
    data: { customer: customer.id, items: [{ product_name: 'Audit ventes', quantity: 3, unit_price: '12.40' }] },
  });
}

/** Carte Ventes : le bloc qui porte le titre. */
const card = (page, locale) => page.getByRole('heading', { name: S(locale, 'title'), exact: true }).locator('xpath=../..');
const periodButton = (page, locale, period) =>
  page.getByRole('group', { name: S(locale, 'period_label') }).getByRole('button', { name: S(locale, 'period', { period }), exact: true });
const bubble = (page) => page.locator('.recharts-tooltip-wrapper p');

async function openHome(page) {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  nested.push(...await nestedInteractive(page));
}

/** Libellés de l'axe : aucun ne chevauche son voisin, tous dans la carte. */
async function ticksReadable(page, locale) {
  return card(page, locale).evaluate((root) => {
    const box = root.getBoundingClientRect();
    const ticks = [...root.querySelectorAll('.recharts-cartesian-axis-tick-value')].map((el) => el.getBoundingClientRect())
      .sort((a, b) => a.left - b.left);
    return ticks.length > 1 && ticks.every((r, i) => r.left >= box.left - 1 && r.right <= box.right + 1
      && (i === 0 || r.left >= ticks[i - 1].right + 2));
  });
}

async function checkPeriod(page, ctx, period) {
  const { label, locale } = ctx;
  const name = S(locale, 'period', { period });
  // « 7 jours » est déjà choisi (et en cache) : pas de requête à attendre, les points viennent de l'API.
  await periodButton(page, locale, period).click();
  const data = await api(page, `dashboard/sales/?period=${period}`);
  await page.waitForFunction(() => !document.querySelector('[aria-busy=true]'));
  report.check(await periodButton(page, locale, period).getAttribute('aria-pressed') === 'true',
    `${label} : « ${name} » choisi`);
  const headline = period === 'all' ? null : S(locale, 'headline_label', { period, date: '' });
  report.check(headline === null || await shown(card(page, locale).getByText(headline, { exact: true })),
    `${label} : « ${name} » → ${headline ?? 'depuis l’ouverture'}`);
  const rows = await card(page, locale).locator('table tbody tr').count();
  report.check(rows === data.points.length && rows > 0,
    `${label} : « ${name} » → tableau équivalent de ${rows} ligne(s) (${data.granularity}), comme l'API (${data.points.length})`);
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  report.check(await ticksReadable(page, locale) && overflow <= 0,
    `${label} : « ${name} » → libellés de l'axe lisibles, pas de défilement horizontal (${overflow})`);
  return data;
}

/** Survol du dernier point : ligne verticale et bulle avec son nombre de commandes. */
async function checkHover(page, ctx, data) {
  const { label, locale } = ctx;
  const last = data.points.at(-1);
  const surface = await card(page, locale).locator('.recharts-surface').boundingBox();
  const x = locale === 'ar' ? surface.x + 18 : surface.x + surface.width - 18;
  await page.mouse.move(x, surface.y + surface.height / 2);
  const text = await bubble(page).first().innerText({ timeout: 4000 }).catch(() => '');
  report.check(flat(text).includes(S(locale, 'orders', { count: last.orders_count }))
      && await page.locator('.recharts-tooltip-cursor').count() > 0,
    `${label} : survol du dernier point → ligne verticale et bulle « ${flat(text)} »`);
  await page.mouse.move(0, 0);
}

/**
 * Clavier : Tab depuis le sélecteur jusqu'à la courbe, deux pas vers la fin puis un vers le début
 * (axe inversé en arabe) → la bulle passe d'un point à l'autre.
 */
async function checkKeyboard(page, ctx) {
  const { label, locale } = ctx;
  const [forward, back] = locale === 'ar' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
  // recharts traite au plus une touche par image : attendre deux images entre deux touches.
  const press = async (key) => {
    await page.keyboard.press(key);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  };
  const read = async () => flat(await bubble(page).first().innerText({ timeout: 4000 }).catch(() => ''));
  await periodButton(page, locale, 'all').focus();
  await page.keyboard.press('Tab');
  const onChart = await page.evaluate(() => document.activeElement?.classList.contains('recharts-surface')
    || !!document.activeElement?.querySelector('.recharts-surface'));
  await press(forward);
  await press(forward);
  const first = await read();
  await press(back);
  const second = await read();
  report.check(onChart && first !== '' && second !== '' && first !== second,
    `${label} : Tab → courbe, flèches → bulle au clavier (« ${first} », puis « ${second} »)`);
  await page.keyboard.press('Shift+Tab');
}

async function checkRemembered(page, ctx) {
  const { label, locale } = ctx;
  await openHome(page);
  const me = await api(page, 'auth/me/');
  report.check(me.sales_period === 'all' && await periodButton(page, locale, 'all').getAttribute('aria-pressed') === 'true',
    `${label} : rechargement → « ${S(locale, 'period', { period: 'all' })} » toujours choisi (compte : ${me.sales_period})`);
}

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const order = await setup(page);
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
          await api(page, 'auth/me/', { method: 'PATCH', data: { sales_period: '7d' } });
          await openHome(page);
          report.check(await shown(card(page, locale).locator('.recharts-area-curve')), `${label} : courbe des ventes affichée`);
          for (const period of PERIODS) {
            const data = await checkPeriod(page, run, period);
            await checkHover(page, run, data);
          }
          await checkKeyboard(page, run);
          await checkRemembered(page, run);
        } catch (error) {
          report.check(false, `${label} : parcours interrompu — ${error.message.split('\n')[0]}`);
        }
        const problems = [...watch.problems.slice(before), ...nested.splice(0).map((n) => `imbriqué : ${n}`)];
        report.check(problems.length === 0, `${label} : console propre, aucun élément imbriqué${problems.map((p) => `\n      ${p}`).join('')}`);
      }
    }
    await api(page, 'auth/me/', { method: 'PATCH', data: { sales_period: '7d' } });
    await api(page, `orders/${order.id}/status/`, { method: 'POST', data: { status: 'cancelled' } });
    await ctx.close();
  }
} finally {
  await browser.close();
}
report.finish();
