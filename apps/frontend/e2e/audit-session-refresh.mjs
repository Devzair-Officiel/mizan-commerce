/**
 * Rafraîchissement de session (jeton de rafraîchissement à usage unique, liste noire du backend) :
 * - jeton d'accès invalide, 5 requêtes simultanées : toutes réussissent, le jeton de rafraîchissement
 *   est renouvelé une seule fois ;
 * - requête tardive avec les anciens cookies (fenêtre de réutilisation du proxy) : réussit, même jeton ;
 * - deux onglets en même temps : aucun n'est déconnecté, les deux restent dans l'application ;
 * - déconnexion : cookies effacés, le dernier jeton de rafraîchissement ne rouvre pas la session ;
 * - console propre.
 * Connexion propre à l'audit (contexte neuf, hors sessions partagées) : sa déconnexion ne ferme
 * que sa session. Une seule configuration (1440, français clair) : aucun rendu n'est vérifié.
 * Fin de ses 5 appels limités ('auth') notée dans `AUDIT_STATE_DIR` : audit-session-race attend 60 s après.
 */
import { writeFile } from 'node:fs/promises';
import { BASE, EMAIL, PASSWORD, createReport, launch } from './lib/session.mjs';
import { watchConsole } from './lib/watch.mjs';

const report = createReport();
const browser = await launch();

const cookie = async (ctx, name) => (await ctx.cookies(BASE)).find((c) => c.name === name)?.value;
const setCookies = (ctx, values) => ctx.addCookies(
  Object.entries(values).map(([name, value]) => ({ name, value, url: BASE, httpOnly: true, sameSite: 'Lax' })),
);
/** `count` requêtes authentifiées lancées en même temps depuis la page : leurs statuts. */
const burst = (page, count) => page.evaluate(
  (n) => Promise.all(Array.from({ length: n }, () => fetch('/api/proxy/auth/me/').then((r) => r.status))),
  count,
);
const path = (page) => new URL(page.url()).pathname;

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const watch = watchConsole(page);
  const other = await ctx.newPage();
  const otherWatch = watchConsole(other);
  try {
    watch.setLabel('connexion');
    await page.goto(`${BASE}/login`);
    await page.fill('#email', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
    await page.waitForLoadState('networkidle');
    const first = await cookie(ctx, 'refresh_token');
    report.check(Boolean(first), 'connexion : cookie de rafraîchissement posé');

    watch.setLabel('requêtes simultanées');
    await setCookies(ctx, { access_token: 'expire' });
    const statuses = await burst(page, 5);
    report.check(statuses.every((s) => s === 200), `5 requêtes simultanées, jeton d'accès invalide : toutes réussissent (${statuses.join(', ')})`);
    const second = await cookie(ctx, 'refresh_token');
    report.check(Boolean(second) && second !== first, 'jeton de rafraîchissement renouvelé');
    report.check(!['expire', undefined].includes(await cookie(ctx, 'access_token')), 'jeton d\'accès renouvelé');

    watch.setLabel('requête tardive');
    await setCookies(ctx, { access_token: 'expire', refresh_token: first });
    const [late] = await burst(page, 1);
    report.check(late === 200, `requête tardive avec les anciens cookies : réussit (${late})`);
    report.check(await cookie(ctx, 'refresh_token') === second, 'requête tardive : même jeton renouvelé, aucun second rafraîchissement');

    watch.setLabel('deux onglets');
    otherWatch.setLabel('deux onglets (second)');
    await other.goto(`${BASE}/dashboard`);
    await other.waitForLoadState('networkidle');
    await setCookies(ctx, { access_token: 'expire' });
    const [mine, theirs] = await Promise.all([burst(page, 3), burst(other, 3)]);
    report.check([...mine, ...theirs].every((s) => s === 200), `deux onglets en même temps : toutes les requêtes réussissent (${[...mine, ...theirs].join(', ')})`);
    const third = await cookie(ctx, 'refresh_token');
    report.check(Boolean(third) && third !== second, 'deux onglets : jeton de rafraîchissement renouvelé');
    await Promise.all([page.goto(`${BASE}/dashboard`), other.reload()]);
    await Promise.all([page.waitForLoadState('networkidle'), other.waitForLoadState('networkidle')]);
    report.check(path(page) === '/dashboard' && path(other) === '/dashboard', `deux onglets : toujours dans l'application (${path(page)}, ${path(other)})`);

    watch.setLabel('déconnexion');
    await other.close();
    const logout = await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).then((r) => r.status));
    report.check(logout === 200 && !(await cookie(ctx, 'refresh_token')) && !(await cookie(ctx, 'access_token')),
      `déconnexion : cookies effacés (${logout})`);
    await page.goto(`${BASE}/login`);
    // Dernier jeton remis à la main : le backend l'a mis sur liste noire, le proxy ne le réutilise pas.
    await setCookies(ctx, { access_token: 'expire', refresh_token: third });
    const revoked = await ctx.request.get(`${BASE}/api/proxy/auth/me/`);
    report.check(revoked.status() === 401 && !(await cookie(ctx, 'refresh_token')),
      `après la déconnexion, le dernier jeton ne rouvre pas la session (${revoked.status()})`);
  } finally {
    const problems = [...watch.problems, ...otherWatch.problems];
    report.check(problems.length === 0, `console propre${problems.map((p) => `\n      ${p}`).join('')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (process.env.AUDIT_STATE_DIR) await writeFile(`${process.env.AUDIT_STATE_DIR}/session-refresh.done`, String(Date.now()));
}
report.finish();
