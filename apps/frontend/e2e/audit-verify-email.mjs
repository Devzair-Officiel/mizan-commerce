/**
 * Lien de vérification d'e-mail ouvert par un utilisateur déjà connecté (fr clair 1440 / ar sombre 360) :
 * - les autres écrans d'auth renvoient toujours un utilisateur connecté vers /dashboard ;
 * - le tableau de bord affiche le bandeau « Confirmez votre adresse email » tant que l'adresse n'est pas vérifiée ;
 * - /verify-email?uid=…&token=… n'est pas redirigé, l'appel de vérification part avec uid et token ;
 * - après succès, le bouton mène (via /login, renvoyé par le proxy) au tableau de bord, sans le bandeau.
 * La vérification est simulée (`/api/auth/verify-email`) et `email_verified_at` réécrit dans `/auth/me/` : aucun appel réel.
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';

const report = createReport();
const browser = await launch();
const UID = 'QVVESVQ';
const TOKEN = 'audit-verification-token';
const OTHER_AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

try {
  for (const viewport of VIEWPORTS) {
    const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
    const state = { theme: 'light', verified: false, calls: [] };
    // Déclarée après celle d'openSession, cette route la remplace : thème et vérification réécrits ensemble.
    await ctx.route(/\/api\/proxy\/auth\/me\/?(\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      try {
        const response = await route.fetch();
        const me = await response.json();
        await route.fulfill({ response, json: { ...me, theme_mode: state.theme, email_verified_at: state.verified ? '2026-01-01T00:00:00Z' : null } });
      } catch { /* Contexte fermé pendant une requête. */ }
    });
    await ctx.route(/\/api\/auth\/verify-email\?/, (route) => {
      const url = new URL(route.request().url());
      state.calls.push({ uid: url.searchParams.get('uid'), token: url.searchParams.get('token') });
      state.verified = true;
      return route.fulfill({ json: { detail: 'Audit' } });
    });
    try {
      for (const locale of ['fr', 'ar']) for (const theme of ['light', 'dark']) {
        if (!inMatrix(viewport, locale, theme)) continue;
        const label = `${viewport.name}px ${locale} ${theme}`;
        console.log(`\n=== ${label}`);
        await setLocale(locale); setTheme(theme); state.theme = theme; state.verified = false; state.calls = [];
        watch.setLabel(label);
        const banner = page.getByText(msg(locale, 'dashboard.notice.email_title'), { exact: true });

        for (const path of OTHER_AUTH_PAGES) {
          await page.goto(`${BASE}${path}`);
          report.check(new URL(page.url()).pathname === '/dashboard', `${label} : ${path} renvoie toujours un utilisateur connecté vers /dashboard`);
        }
        await settle(page);
        report.check(await banner.isVisible(), `${label} : bandeau de vérification sur le tableau de bord, adresse non vérifiée`);

        const response = await page.goto(`${BASE}/verify-email?uid=${UID}&token=${TOKEN}`);
        report.check(new URL(page.url()).pathname === '/verify-email' && response.request().redirectedFrom() === null,
          `${label} : /verify-email s'affiche sans redirection (${new URL(page.url()).pathname})`);
        await page.getByRole('heading', { name: msg(locale, 'auth.verifyEmail.success_title'), exact: true }).waitFor();
        report.check(state.calls.length > 0 && state.calls.every((c) => c.uid === UID && c.token === TOKEN),
          `${label} : appel de vérification envoyé avec uid et token (${state.calls.length} appel(s), simulé)`);
        await settle(page);
        await page.screenshot({ path: `results/verify-email-${viewport.name}-${locale}-${theme}.png`, fullPage: true });

        const meLoaded = page.waitForResponse((r) => /\/api\/proxy\/auth\/me\/?(\?.*)?$/.test(new URL(r.url()).pathname) && r.ok());
        await page.getByRole('link', { name: msg(locale, 'auth.verifyEmail.signin_cta'), exact: true }).click();
        await page.waitForURL((u) => u.pathname === '/dashboard');
        await meLoaded;
        await settle(page);
        report.check(await banner.count() === 0, `${label} : « ${msg(locale, 'auth.verifyEmail.signin_cta')} » mène au tableau de bord, sans le bandeau`);
      }
    } finally {
      report.check(watch.problems.length === 0, `${viewport.name}px : console propre, défilement libre${watch.problems.map((p) => `\n      ${p}`).join('')}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
report.finish();
