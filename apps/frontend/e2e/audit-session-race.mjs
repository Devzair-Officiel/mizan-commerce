/**
 * Course de rafraîchissement et sortie de session (jeton de rafraîchissement à usage unique, liste
 * noire du backend) :
 * - jeton d'accès expiré, 5 requêtes envoyées avec les MÊMES anciens cookies à 0, 20, 100, 400 et
 *   1500 ms (hors navigateur : la réponse qui porte les nouveaux cookies n'est jamais reçue) : toutes
 *   réussissent, avec la même nouvelle paire (fenêtre de grâce) ;
 * - une autre session lancée en même temps reçoit sa propre paire ;
 * - navigateur resté sur les anciens cookies (réponse perdue) : le tableau de bord se charge ;
 * - jeton falsifié, cookie d'accès seul : 401 `session_expired`, les deux cookies effacés ;
 * - échec définitif dans le navigateur : un seul passage par /login, plus de retour au tableau de bord ;
 * - fenêtre expirée (31 s) : l'ancien jeton est refusé, cookies effacés.
 * Connexions propres à l'audit (contextes neufs). Une seule configuration (1440, français clair).
 * Dans les deux scénarios d'échec définitif, seuls les 401 des appels à l'API sont tolérés en console.
 */
import { request } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
import { BASE, EMAIL, PASSWORD, createReport, launch } from './lib/session.mjs';
import { watchConsole } from './lib/watch.mjs';

const OFFSETS = [0, 20, 100, 400, 1500];
const GRACE_MS = 30_000;
const SESSION_401 = /Failed to load resource: the server responded with a status of 401/;

const report = createReport();
const browser = await launch();
const problems = [];

/** Set-Cookie d'une réponse : valeur posée par cookie, `null` s'il est effacé. */
function sessionCookies(res) {
  const out = {};
  for (const { name, value } of res.headersArray()) {
    if (name.toLowerCase() !== 'set-cookie') continue;
    const [pair] = value.split(';');
    const [key, ...rest] = pair.split('=');
    const cleared = /expires=thu, 01 jan 1970/i.test(value) || /max-age=0/i.test(value);
    out[key.trim()] = cleared ? null : rest.join('=');
  }
  return out;
}

/** Appel authentifié avec ces cookies seulement : contexte neuf, rien n'est gardé d'un appel à l'autre. */
async function call(cookies) {
  const api = await request.newContext({ baseURL: BASE });
  try {
    const header = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await api.get('/api/proxy/auth/me', { headers: { Cookie: header }, maxRedirects: 0 });
    return { status: res.status(), body: await res.json().catch(() => null), set: sessionCookies(res) };
  } finally {
    await api.dispose();
  }
}

const staggered = (cookies, offsets) => Promise.all(offsets.map((ms) => sleep(ms).then(() => call(cookies))));
const cookie = async (ctx, name) => (await ctx.cookies(BASE)).find((c) => c.name === name)?.value;
const setCookies = (ctx, values) => ctx.addCookies(
  Object.entries(values).map(([name, value]) => ({ name, value, url: BASE, httpOnly: true, sameSite: 'Lax' })),
);
const path = (page) => new URL(page.url()).pathname;
const isClosed = (r) => r.status === 401 && r.body?.code === 'session_expired'
  && r.set.access_token === null && r.set.refresh_token === null;

/** Connexion dans un contexte neuf : ses cookies de session. */
async function login() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('#email', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
  await page.waitForLoadState('networkidle');
  return { ctx, page, refresh: await cookie(ctx, 'refresh_token') };
}

/**
 * Tableau de bord ouvert avec ces cookies, puis 4 s d'observation : chargements de document de la
 * page principale (« 307 /login »…), chemin final, cookies restants, puis retour arrière.
 */
async function landing(label, cookies) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const watch = watchConsole(page);
  watch.setLabel(label);
  const loads = [];
  page.on('response', (r) => {
    if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) loads.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  try {
    await setCookies(ctx, cookies);
    await page.goto(`${BASE}/dashboard`).catch(() => undefined);
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 10_000 }).catch(() => undefined);
    await sleep(4_000);
    const settled = { path: path(page), loads: [...loads], left: (await ctx.cookies(BASE)).map((c) => c.name) };
    await page.goBack({ timeout: 5_000 }).catch(() => undefined);
    await sleep(2_000);
    settled.afterBack = path(page);
    problems.push(...watch.problems.filter((p) => !SESSION_401.test(p)));
    return settled;
  } finally {
    await ctx.close();
  }
}

function checkLanding(label, result) {
  const logins = result.loads.filter((l) => l.endsWith(' /login')).length;
  const bounced = result.loads.filter((l) => l.startsWith('307 /login')).length;
  report.check(result.path === '/login' && logins === 1 && bounced === 0,
    `${label} : un seul passage par /login (${result.path} ; ${result.loads.join(', ')})`);
  report.check(!result.left.includes('access_token') && !result.left.includes('refresh_token'),
    `${label} : cookies de session effacés (restants : ${result.left.join(', ') || 'aucun'})`);
  report.check(result.afterBack !== '/dashboard', `${label} : retour arrière sans tableau de bord (${result.afterBack})`);
}

try {
  const a = await login();
  const b = await login();
  report.check(Boolean(a.refresh && b.refresh && a.refresh !== b.refresh), 'deux connexions : deux jetons de rafraîchissement distincts');

  // --- Course décalée : mêmes anciens cookies, réponses jamais reçues par un navigateur ---------
  const [mine, theirs] = await Promise.all([
    staggered({ access_token: 'expire', refresh_token: a.refresh }, OFFSETS),
    staggered({ access_token: 'expire', refresh_token: b.refresh }, [0, 400]),
  ]);
  const renewedAt = Date.now();
  report.check(mine.every((r) => r.status === 200),
    `requêtes à ${OFFSETS.join(', ')} ms avec les mêmes anciens cookies : toutes réussissent (${mine.map((r) => r.status).join(', ')})`);
  const pairs = new Set(mine.map((r) => `${r.set.access_token}|${r.set.refresh_token}`));
  const [access, refresh] = [...pairs][0]?.split('|') ?? [];
  report.check(pairs.size === 1 && Boolean(refresh) && refresh !== a.refresh && refresh !== 'null',
    `une seule nouvelle paire pour toutes (${pairs.size})`);
  report.check(theirs.every((r) => r.status === 200), `autre session en même temps : réussit (${theirs.map((r) => r.status).join(', ')})`);
  const other = theirs[0]?.set ?? {};
  report.check(Boolean(other.refresh_token) && other.refresh_token !== refresh && other.access_token !== access,
    'autre session : sa propre paire, jamais celle de la première');

  // --- Réponse perdue : le navigateur a gardé les anciens cookies ------------------------------
  const watchA = watchConsole(a.page);
  watchA.setLabel('réponse perdue');
  const failed = [];
  a.page.on('response', (r) => { if (r.url().includes('/api/') && r.status() === 401) failed.push(new URL(r.url()).pathname); });
  await setCookies(a.ctx, { access_token: 'expire', refresh_token: a.refresh });
  await a.page.goto(`${BASE}/dashboard`);
  await a.page.waitForLoadState('networkidle');
  report.check(path(a.page) === '/dashboard' && failed.length === 0,
    `réponse perdue, anciens cookies gardés : tableau de bord chargé (${path(a.page)} ; 401 : ${failed.join(', ') || 'aucun'})`);
  report.check(await cookie(a.ctx, 'refresh_token') === refresh, 'réponse perdue : le navigateur reçoit la paire déjà obtenue');
  problems.push(...watchA.problems);

  // --- Jetons sans fenêtre de grâce ----------------------------------------------------------
  const forged = `${a.refresh.slice(0, -4)}${a.refresh.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
  const tampered = await call({ access_token: 'expire', refresh_token: forged });
  report.check(isClosed(tampered), `jeton falsifié : 401 session_expired, cookies effacés (${tampered.status}, ${tampered.body?.code})`);
  const accessOnly = await call({ access_token: 'expire' });
  report.check(isClosed(accessOnly), `cookie d'accès seul : 401 session_expired, cookies effacés (${accessOnly.status}, ${accessOnly.body?.code})`);

  // --- Échec définitif dans le navigateur : pas de boucle /login ↔ /dashboard ------------------
  checkLanding('jeton refusé', await landing('jeton refusé', { access_token: 'expire', refresh_token: forged }));
  checkLanding('cookie d\'accès seul', await landing('cookie d\'accès seul', { access_token: 'expire' }));

  // --- Fenêtre expirée ---------------------------------------------------------------------------
  await sleep(Math.max(0, renewedAt + GRACE_MS + 1_000 - Date.now()));
  const late = await call({ access_token: 'expire', refresh_token: a.refresh });
  report.check(isClosed(late), `ancien jeton après 31 s : 401 session_expired, cookies effacés (${late.status}, ${late.body?.code})`);

  await Promise.all([a.ctx.close(), b.ctx.close()]);
} finally {
  report.check(problems.length === 0, `console propre${problems.map((p) => `\n      ${p}`).join('')}`);
  await browser.close();
}
report.finish();
