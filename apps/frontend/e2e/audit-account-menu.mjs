/**
 * Audit du compte : badge d'abonnement (sidebar à 1440px, menu burger à 360px) et raccourci clair/sombre du header,
 * en français et en arabe, en clair et en sombre :
 * - le badge affiche la formule courante : « Boutique+ » (la vraie souscription de la boutique d'audit),
 *   « Pro », « Essai · 12 j » pendant l'essai, « Essai terminé » et « Gratuit » après l'essai ; zone ≥ 44px,
 *   dans les limites du panneau (à droite en arabe), et il mène à Paramètres → Abonnement ;
 * - desktop : la sidebar reprend le menu burger à plat (Compte, Langue, Se déconnecter), sans sous-menu ;
 * - le raccourci du header (≥ 44px) est collé à la loupe sur mobile, à la barre de recherche sur desktop, côté début de
 *   ligne ; il bascule le thème, son libellé suit, puis le thème revient.
 * Pro, essai et essai terminé sont réécrits dans la réponse `/subscriptions/current/` (comme audit-stock-entry-plan).
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { animationsDone } from './lib/wait.mjs';

const report = createReport();
const PRO = { code: 'pro', name: 'Pro' };
const TRIAL_DAYS = 12;

const STATES = {
  boutique_plus: (s) => s,
  trial: (s) => ({ ...s, status: 'trialing', is_trial_expired: false, days_remaining: TRIAL_DAYS }),
  pro: (s) => ({ ...s, status: 'active', effective_plan_code: 'pro', plan: { ...s.plan, ...PRO }, days_remaining: null }),
  expired: (s) => ({ ...s, status: 'active', is_trial_expired: true, effective_plan_code: 'free', days_remaining: null }),
};

async function routePlan(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/current\/?(\?.*)?$/, async (route) => {
    try {
      const response = await route.fetch();
      const subscription = await response.json();
      await route.fulfill({ response, json: STATES[state.name](subscription) });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

/** Libellé attendu du badge pour l'état `name`. */
const expectedLabel = (locale, name) => msg(locale, name === 'expired' ? 'layout.trial.card_expired' : 'settings.subscription.title');

/** Pastille attendue : la formule, ou les jours d'essai restants. */
function expectedPill(locale, name) {
  if (name === 'trial') return fmt(locale, 'layout.trial.badge_trial', { days: TRIAL_DAYS });
  return msg(locale, `settings.subscription.plans.${name === 'expired' ? 'free' : name}.name`);
}

const inside = (box, panel) => box && panel && box.x >= panel.x - 1 && box.x + box.width <= panel.x + panel.width + 1;

/** Le menu (sidebar ou burger) ouvert, et le badge qu'il contient. */
async function openMenu(page, viewport, locale, label) {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  if (!viewport.mobile) {
    const panel = page.locator('aside').filter({ visible: true }).first();
    return { panel, badge: panel.getByRole('link').filter({ hasText: label }) };
  }
  await page.getByRole('button', { name: msg(locale, 'layout.common.menu'), exact: true }).click();
  const panel = page.getByRole('dialog', { name: msg(locale, 'layout.common.menu') });
  await panel.waitFor();
  await animationsDone(panel);
  return { panel, badge: panel.getByRole('button').filter({ hasText: label }) };
}

async function checkBadge(page, viewport, locale, label, name) {
  const want = expectedLabel(locale, name);
  const { panel, badge } = await openMenu(page, viewport, locale, want);
  await badge.waitFor({ timeout: 10000 });
  const pill = expectedPill(locale, name);
  const text = (await badge.innerText()).replace(/\s+/g, ' ').trim();
  const box = await badge.boundingBox();
  report.check(text.includes(want) && text.includes(pill), `${label} : ${name}, badge « ${text} » (attendu « ${want} » + « ${pill} »)`);
  report.check(box.height >= 44 && inside(box, await panel.boundingBox()), `${label} : ${name}, badge de ${Math.round(box.height)}px de haut, dans le panneau`);
  if (name !== 'trial') return;
  await badge.click();
  await page.waitForURL(/\/settings\/subscription$/);
  report.check(true, `${label} : le badge mène à Paramètres → Abonnement`);
}

const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'));

/** Le raccourci touche la loupe (mobile) ou la barre de recherche (desktop), du côté du début de ligne : à gauche en français, à droite en arabe. */
function besideSearch(toggle, search, locale) {
  if (!toggle || !search || Math.abs(toggle.y + toggle.height / 2 - (search.y + search.height / 2)) > 2) return false;
  const gap = locale === 'ar' ? toggle.x - (search.x + search.width) : search.x - (toggle.x + toggle.width);
  return gap >= 0 && gap <= 16;
}

async function checkThemeShortcut(page, locale, label) {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  const header = page.locator('header').filter({ visible: true }).first();
  const start = await isDark(page);
  const names = [msg(locale, 'layout.themeDrawer.switch_to_dark'), msg(locale, 'layout.themeDrawer.switch_to_light')];
  const [first, second] = start ? [names[1], names[0]] : names;
  const item = header.getByRole('button', { name: first, exact: true });
  const search = header.getByRole('button', { name: msg(locale, 'layout.common.search'), exact: true }).filter({ visible: true });
  const box = await item.boundingBox();
  report.check(box && box.height >= 44 && box.width >= 44, `${label} : raccourci « ${first} » de ${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)}px`);
  report.check(besideSearch(box, await search.boundingBox(), locale), `${label} : raccourci collé à la recherche, côté début de ligne`);
  await item.click();
  await page.waitForFunction((d) => document.documentElement.classList.contains('dark') === d, !start);
  const back = header.getByRole('button', { name: second, exact: true });
  report.check(await back.isVisible(), `${label} : thème basculé sur place, libellé « ${second} »`);
  await back.click();
  await page.waitForFunction((d) => document.documentElement.classList.contains('dark') === d, start);
  report.check((await isDark(page)) === start, `${label} : second appui, thème d'origine rétabli`);
}

/** Desktop : la sidebar reprend le menu burger à plat (Compte, Langue, Se déconnecter), sans sous-menu. */
async function checkSidebar(page, locale, label) {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  const aside = page.locator('aside').filter({ visible: true }).first();
  const profile = aside.getByRole('link', { name: msg(locale, 'layout.nav.profile'), exact: true });
  const logout = aside.getByRole('button', { name: msg(locale, 'layout.common.logout'), exact: true });
  const flat = (await aside.locator('[aria-haspopup]').count()) === 0
    && (await aside.getByRole('heading', { name: msg(locale, 'layout.burgerMenu.account_section'), exact: true }).count()) === 1
    && (await aside.getByRole('group', { name: msg(locale, 'layout.common.language'), exact: true }).count()) === 1
    && (await profile.count()) === 1 && (await logout.count()) === 1;
  report.check(flat, `${label} : sidebar à plat — Compte, Langue et « Se déconnecter », sans sous-menu`);
  const rows = await Promise.all([profile, logout].map((l) => l.boundingBox()));
  report.check(rows.every((b) => b && b.height >= 44), `${label} : lignes de la sidebar ≥ 44px`);
  await profile.click();
  await page.waitForURL(/\/profile$/);
  report.check(true, `${label} : « ${msg(locale, 'layout.nav.profile')} » ouvre le profil`);
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const state = { name: 'boutique_plus' };
  await routePlan(ctx, state);
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
        for (const name of ['boutique_plus', 'pro', 'expired', 'trial']) {
          state.name = name;
          await checkBadge(page, viewport, locale, label, name);
        }
        if (!viewport.mobile) await checkSidebar(page, locale, label);
        await checkThemeShortcut(page, locale, label);
      } catch (error) {
        report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
      } finally {
        state.name = 'boutique_plus';
      }
      const problems = watch.problems.slice(before);
      report.check(problems.length === 0, `${label} : console propre, défilement jamais bloqué${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await ctx.close();
}
await browser.close();
report.finish();
