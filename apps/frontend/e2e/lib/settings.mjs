import { BASE } from './session.mjs';

/** Formule simulée côté navigateur ; les données et plafonds du catalogue restent ceux de l'API. */
export async function settingsPlan(ctx, state) {
  await ctx.route(/\/api\/proxy\/subscriptions\/current\/?(\?.*)?$/, async (route) => {
    try {
      const response = await route.fetch();
      const sub = await response.json();
      await route.fulfill({ response, json: {
        ...sub, status: 'active', is_trial_expired: false, effective_plan_code: state.code,
        plan: { ...sub.plan, code: state.code },
        usage: { ...sub.usage, members: { count: state.count ?? sub.usage.members.count, limit: state.limit ?? sub.usage.members.limit } },
      } });
    } catch { /* Fermeture du contexte pendant une requête. */ }
  });
}

export async function settingsGoto(page, path = '/settings') {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

/** Débordement du document et des composants de la colonne (un scroll horizontal local est signalé aussi). */
export async function settingsOverflow(page) {
  return page.locator('[data-settings-content]').evaluate((root) => {
    const visible = (el) => el.checkVisibility() && el.getBoundingClientRect().width > 0;
    return {
      document: document.documentElement.scrollWidth > innerWidth + 1,
      elements: [...root.querySelectorAll('*')].filter((el) => visible(el) && el.clientWidth > 0
        && el.scrollWidth > el.clientWidth + 2 && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
        && getComputedStyle(el).overflowX !== 'hidden' && getComputedStyle(el).overflowX !== 'clip')
        .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 90)} (${el.scrollWidth}/${el.clientWidth})`),
    };
  });
}
