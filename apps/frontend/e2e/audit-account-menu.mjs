/**
 * Audit du compte : badge d'abonnement (sidebar à 1440px, menu burger à 360px) et raccourci clair/sombre du header,
 * en français et en arabe, en clair et en sombre :
 * - la ligne « Abonnement » porte la formule courante, au nom traduit par code (pas le nom brut de l'API) : celle de
 *   la vraie souscription de la boutique d'audit, « Solo », « Essai · 12 j » pendant l'essai, « Essai terminé » après l'essai ; zone ≥ 44px (36px dans la sidebar desktop),
 *   dans les limites du panneau (à droite en arabe), et elle mène à Paramètres → Abonnement ;
 * - le raccourci du header (≥ 44px) est collé à la loupe sur mobile, à la barre de recherche sur desktop, côté début de
 *   ligne ; il bascule le thème, son libellé suit, puis le thème revient.
 * Solo, essai et essai terminé sont réécrits dans la réponse `/subscriptions/current/` (comme audit-stock-entry-plan).
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { fmt, msg } from './lib/messages.mjs';
import { animationsDone } from './lib/wait.mjs';

const report = createReport();
// Nom d'API volontairement différent : la pastille doit afficher la traduction du code, pas ce nom.
const SOLO = { code: 'solo', name: 'Nom API brut' };
const TRIAL_DAYS = 12;

const STATES = {
  boutique: (s) => s,
  trial: (s) => ({ ...s, status: 'trialing', is_trial_expired: false, days_remaining: TRIAL_DAYS }),
  solo: (s) => ({ ...s, status: 'active', effective_plan_code: 'solo', plan: { ...s.plan, ...SOLO }, days_remaining: null }),
  expired: (s) => ({ ...s, status: 'active', is_trial_expired: true, effective_plan_code: 'free', days_remaining: null }),
};

async function routePlan(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/current\/?(\?.*)?$/, async (route) => {
    try {
      const response = await route.fetch();
      const subscription = await response.json();
      state.realCode ??= subscription.plan.code;
      await route.fulfill({ response, json: STATES[state.name](subscription) });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
}

/** Pastille attendue : le nom traduit de la formule, les jours d'essai restants, ou l'essai terminé. */
function expectedPill(locale, state) {
  if (state.name === 'trial') return fmt(locale, 'layout.trial.badge_trial', { days: TRIAL_DAYS });
  if (state.name === 'expired') return msg(locale, 'layout.trial.card_expired');
  return msg(locale, `settings.subscription.plans.${state.name === 'solo' ? SOLO.code : state.realCode}.name`);
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

async function checkBadge(page, viewport, locale, label, state) {
  const { name } = state;
  const want = msg(locale, 'settings.subscription.title');
  const { panel, badge } = await openMenu(page, viewport, locale, want);
  await badge.waitFor({ timeout: 10000 });
  const pill = expectedPill(locale, state);
  const text = (await badge.innerText()).replace(/\s+/g, ' ').trim();
  const box = await badge.boundingBox();
  report.check(text.includes(want) && text.includes(pill), `${label} : ${name}, badge « ${text} » (attendu « ${want} » + « ${pill} »)`);
  // Lignes de 36px dans la sidebar desktop (pointeur fin, maquette du lot 7a), 44px au doigt.
  const minHeight = viewport.mobile ? 44 : 36;
  report.check(box.height >= minHeight - 0.5 && inside(box, await panel.boundingBox()), `${label} : ${name}, badge de ${Math.round(box.height)}px de haut (≥ ${minHeight}), dans le panneau`);
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

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const state = { name: 'boutique' };
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
          for (const name of ['boutique', 'solo', 'expired', 'trial']) {
            state.name = name;
            await checkBadge(page, viewport, locale, label, state);
          }
          await checkThemeShortcut(page, locale, label);
        } catch (error) {
          report.check(false, `${label} : interrompu — ${error.message.split('\n')[0]}`);
        } finally {
          state.name = 'boutique';
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
