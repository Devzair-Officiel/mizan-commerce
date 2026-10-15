/**
 * Audit de la sidebar desktop (1440px), en français et en arabe, en clair et en sombre :
 * - déployée (272px) : navigation nommée, titres de groupe plus grands et plus gras que les items, accordéon
 *   « Articles » (aria-expanded, Catalogue et Stock dessous), groupe Compte (profil, paramètres, abonnement),
 *   pied fixe (clair / sombre / système, langue, Se déconnecter) ; le contenu commence après la sidebar ;
 * - repliée en rail (80px) : icônes nommées (aria-label), sous-menu en flyout au survol et au clavier, ouvert
 *   côté fin de ligne (à droite en français, à gauche en arabe), Échap rend le focus ; menu du compte (thème, langue) ;
 * - la préférence est gardée sur le compte : après rechargement, la sidebar reste repliée, puis redéployée.
 * La sidebar est remise déployée à la fin de chaque passage.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';
import { animationsDone } from './lib/wait.mjs';

const report = createReport();
const near = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;

const aside = (page) => page.locator('aside#desktop-sidebar');
const isCollapsed = async (page) => (await aside(page).getAttribute('data-collapsed')) !== null;

async function openDashboard(page) {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  await aside(page).waitFor();
}

/** Bascule déployée / rail par le bouton de l'en-tête, préférence enregistrée sur le compte. */
async function toggle(page, locale, collapse) {
  const name = msg(locale, collapse ? 'layout.sidebar.collapse' : 'layout.sidebar.expand');
  const saved = page.waitForResponse((r) => /\/auth\/me\/?$/.test(new URL(r.url()).pathname) && r.request().method() === 'PATCH');
  await aside(page).getByRole('button', { name, exact: true }).click();
  await saved;
  await page.waitForFunction((want) => document.querySelector('aside#desktop-sidebar')?.hasAttribute('data-collapsed') === want, collapse);
  await animationsDone(aside(page));
}

/** Le contenu commence après la sidebar : à droite d'elle en français, à gauche en arabe. */
async function contentAfterSidebar(page, locale) {
  const side = await aside(page).boundingBox();
  const main = await page.locator('main').boundingBox();
  const content = await page.locator('main > div').first().boundingBox();
  if (!side || !main || !content) return false;
  return locale === 'ar' ? content.x + content.width <= side.x + 1 : content.x >= side.x + side.width - 1;
}

async function checkExpanded(page, locale, label) {
  const box = await aside(page).boundingBox();
  report.check(near(box.width, 272), `${label} : sidebar déployée de ${Math.round(box.width)}px (272 attendus)`);
  const nav = page.getByRole('navigation', { name: msg(locale, 'layout.sidebar.nav_label'), exact: true });
  report.check(await nav.isVisible(), `${label} : navigation nommée « ${msg(locale, 'layout.sidebar.nav_label')} »`);

  const title = nav.getByText(msg(locale, 'layout.nav.group_sell'), { exact: true });
  const item = nav.getByRole('link', { name: msg(locale, 'layout.nav.orders') });
  const [titleStyle, itemStyle] = await Promise.all([title, item].map((l) => l.evaluate((el) => {
    const s = getComputedStyle(el);
    return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight) };
  })));
  report.check(titleStyle.size > itemStyle.size && titleStyle.weight >= 700,
    `${label} : titre de groupe ${titleStyle.size}px/${titleStyle.weight}, items ${itemStyle.size}px`);

  const accordion = nav.locator('button[aria-expanded]').first();
  const subLink = nav.getByRole('link', { name: msg(locale, 'layout.nav.stock') });
  if ((await accordion.getAttribute('aria-expanded')) === 'true') await accordion.click();
  report.check(!(await subLink.isVisible()), `${label} : accordéon replié, sous-menu masqué`);
  await accordion.click();
  report.check((await accordion.getAttribute('aria-expanded')) === 'true' && (await subLink.isVisible())
    && (await nav.getByRole('link', { name: msg(locale, 'layout.nav.catalogue') }).isVisible()),
  `${label} : accordéon déplié (aria-expanded), Catalogue et Stock dessous`);

  for (const key of ['layout.nav.profile', 'layout.nav.settings', 'settings.subscription.title']) {
    const link = nav.getByRole('link', { name: msg(locale, key) });
    report.check((await link.count()) > 0, `${label} : groupe Compte, lien « ${msg(locale, key)} »`);
  }
  const theme = aside(page).getByRole('group', { name: msg(locale, 'layout.sidebar.theme') });
  const logout = aside(page).getByRole('button', { name: msg(locale, 'layout.common.logout'), exact: true });
  report.check(await theme.isVisible() && await logout.isVisible(), `${label} : pied de menu (thème, Se déconnecter)`);
  report.check(await contentAfterSidebar(page, locale), `${label} : contenu après la sidebar déployée`);
}

/** Flyout du rail : côté fin de ligne, au survol puis au clavier ; Échap rend le focus au déclencheur. */
async function checkFlyout(page, locale, label) {
  const trigger = aside(page).locator('nav button[aria-haspopup=menu]').first();
  const side = await aside(page).boundingBox();
  await trigger.hover();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  await animationsDone(menu);
  const box = await menu.boundingBox();
  const outside = locale === 'ar' ? box.x + box.width <= side.x + 1 : box.x >= side.x + side.width - 1;
  report.check(outside, `${label} : flyout au survol, ouvert côté fin de ligne (menu ${Math.round(box.x)}–${Math.round(box.x + box.width)}, sidebar ${Math.round(side.x)}–${Math.round(side.x + side.width)})`);
  report.check(await menu.getByRole('menuitem', { name: msg(locale, 'layout.nav.stock') }).isVisible(), `${label} : flyout, lien Stock`);
  await page.mouse.move(side.x + side.width + 600, side.y + 600);
  await menu.waitFor({ state: 'hidden' });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await menu.waitFor();
  await page.keyboard.press('ArrowDown');
  const focusedItem = await page.evaluate(() => document.activeElement?.getAttribute('role'));
  report.check(focusedItem === 'menuitem', `${label} : flyout au clavier, flèche vers le bas sur un lien`);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  report.check(await trigger.evaluate((el) => el === document.activeElement), `${label} : Échap referme, focus rendu au déclencheur`);
}

async function checkRail(page, locale, label) {
  const box = await aside(page).boundingBox();
  report.check(near(box.width, 80), `${label} : rail de ${Math.round(box.width)}px (80 attendus)`);
  const orders = aside(page).getByRole('link', { name: msg(locale, 'layout.nav.orders'), exact: true });
  const ordersBox = await orders.boundingBox();
  report.check(ordersBox && ordersBox.width >= 44 && ordersBox.height >= 44, `${label} : icône Commandes nommée, ${Math.round(ordersBox?.width ?? 0)}px`);
  report.check(await contentAfterSidebar(page, locale), `${label} : contenu après le rail`);
  await checkFlyout(page, locale, label);

  const account = aside(page).getByRole('button', { name: msg(locale, 'layout.sidebar.account_menu') });
  await account.click();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  const radios = await menu.getByRole('menuitemradio').count();
  report.check(radios === 6, `${label} : menu du compte, ${radios} choix (thème × 3, langue × 3)`);
  report.check(await menu.getByRole('menuitem', { name: msg(locale, 'layout.common.logout') }).isVisible(), `${label} : menu du compte, Se déconnecter`);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
}

const browser = await launch();
for (const viewport of VIEWPORTS.filter((v) => !v.mobile)) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      if (!inMatrix(viewport, locale, theme)) continue;
      const label = `${viewport.name}px ${locale} ${theme}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      try {
        await openDashboard(page);
        if (await isCollapsed(page)) await toggle(page, locale, false);
        await checkExpanded(page, locale, label);
        await toggle(page, locale, true);
        await checkRail(page, locale, label);
        await openDashboard(page);
        report.check(await isCollapsed(page), `${label} : rail gardé après rechargement`);
        await toggle(page, locale, false);
        await openDashboard(page);
        report.check(!(await isCollapsed(page)), `${label} : sidebar déployée gardée après rechargement`);
      } catch (error) {
        report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
        await openDashboard(page).then(async () => { if (await isCollapsed(page)) await toggle(page, locale, false); }).catch(() => {});
      }
      const problems = watch.problems.slice(before);
      report.check(problems.length === 0, `${label} : console propre, défilement jamais bloqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await ctx.close();
}
await browser.close();
report.finish();
