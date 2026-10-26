/**
 * Fenêtre de grâce des rafraîchissements (refresh-flights.ts) et journal des sessions (session-log.ts).
 * Lancé par `npm run test:session` (node --test : Node retire lui-même les types des fichiers .ts).
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { GRACE_MS, MAX_FLIGHTS, RefreshFlights, tokenKey } from './refresh-flights.ts';
import { logRefreshFailed, logRefreshGraced, summarizeRequest } from './session-log.ts';

const ACCESS = 'eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIn0.c2lnbmF0dXJlLWFjY2Vzcw';
const REFRESH = 'eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCJ9.c2lnbmF0dXJlLXJlZnJlc2g';
const OTHER = 'eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImp0aSI6IjIifQ.YXV0cmUtc2Vzc2lvbg';
const EMAIL = 'youssef@example.com';

/** Horloge manuelle et backend simulé : chaque appel compte et rend une nouvelle paire. */
function setup() {
  let now = 1_000_000;
  const calls = [];
  const flights = new RefreshFlights(() => now);
  const backend = (token, result) => () => {
    calls.push(token);
    return Promise.resolve(result ?? { status: 'ok', access: `access-${calls.length}`, refresh: `refresh-${calls.length}` });
  };
  return { flights, calls, backend, advance: (ms) => { now += ms; } };
}

/** Attend que les `then` internes aient marqué les vols terminés. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('fenêtre de grâce', () => {
  it('requêtes simultanées et tardives avec le même jeton : une seule demande, même paire', async () => {
    const { flights, calls, backend, advance } = setup();
    const first = flights.run(REFRESH, backend(REFRESH));
    const together = flights.run(REFRESH, backend(REFRESH));
    assert.equal(together.graced, false);
    await settle();
    advance(GRACE_MS - 1);
    const late = flights.run(REFRESH, backend(REFRESH));
    assert.equal(late.graced, true);
    assert.deepEqual(await late.promise, await first.promise);
    assert.equal(calls.length, 1);
  });

  it('deux sessions différentes ne partagent jamais la fenêtre', async () => {
    const { flights, calls, backend } = setup();
    const mine = await flights.run(REFRESH, backend(REFRESH)).promise;
    await settle();
    const theirs = flights.run(OTHER, backend(OTHER));
    assert.equal(theirs.graced, false);
    assert.notDeepEqual(await theirs.promise, mine);
    assert.deepEqual(calls, [REFRESH, OTHER]);
    assert.notEqual(tokenKey(REFRESH), tokenKey(OTHER));
  });

  it('jeton inconnu ou falsifié : jamais servi par la fenêtre', async () => {
    const { flights, calls, backend } = setup();
    await flights.run(REFRESH, backend(REFRESH)).promise;
    await settle();
    for (const forged of [`${REFRESH.slice(0, -4)}AAAA`, `${REFRESH} `, REFRESH.toUpperCase(), 'inconnu', '']) {
      const run = flights.run(forged, backend(forged, { status: 'expired', cause: 'rejected', backendStatus: 401 }));
      assert.equal(run.graced, false, forged);
      assert.equal((await run.promise).status, 'expired');
    }
    assert.equal(calls.length, 6);
  });

  it('échec non gardé : le jeton refusé repart au backend', async () => {
    const { flights, calls, backend } = setup();
    const refused = { status: 'expired', cause: 'rejected', backendStatus: 401 };
    await flights.run(REFRESH, backend(REFRESH, refused)).promise;
    await settle();
    const again = flights.run(REFRESH, backend(REFRESH, refused));
    assert.equal(again.graced, false);
    await again.promise;
    assert.equal(calls.length, 2);
  });

  it('la fenêtre expire après 30 s : l\'ancien jeton repart au backend', async () => {
    const { flights, calls, backend, advance } = setup();
    await flights.run(REFRESH, backend(REFRESH)).promise;
    await settle();
    advance(GRACE_MS);
    const late = flights.run(REFRESH, backend(REFRESH, { status: 'expired', cause: 'rejected', backendStatus: 401 }));
    assert.equal(late.graced, false);
    assert.equal((await late.promise).status, 'expired');
    assert.equal(calls.length, 2);
  });

  it('taille plafonnée', async () => {
    const { flights, backend } = setup();
    for (let i = 0; i < MAX_FLIGHTS + 10; i += 1) flights.run(`jeton-${i}`, backend(`jeton-${i}`));
    await settle();
    assert.equal(flights.size, MAX_FLIGHTS);
  });

  it('jeton révoqué (déconnexion) : sa paire n\'est plus servie', async () => {
    const { flights, calls, backend } = setup();
    const pair = await flights.run(REFRESH, backend(REFRESH)).promise;
    await settle();
    flights.forget(pair.refresh);
    assert.equal(flights.run(REFRESH, backend(REFRESH)).graced, false);
    assert.equal(calls.length, 2);
  });

  it('clé : empreinte, jamais le jeton', () => {
    assert.ok(!tokenKey(REFRESH).includes(REFRESH));
    assert.match(tokenKey(REFRESH), /^[A-Za-z0-9_-]{43}$/);
  });
});

describe('journal des sessions', () => {
  let lines;
  const originals = { warn: console.warn, info: console.info };
  beforeEach(() => {
    lines = [];
    console.warn = (...args) => lines.push(args.join(' '));
    console.info = (...args) => lines.push(args.join(' '));
  });
  afterEach(() => Object.assign(console, originals));

  const cookieHeader = `NEXT_LOCALE=fr; access_token=${ACCESS}; refresh_token=${REFRESH}; refresh_token=${OTHER}`;
  const pathname = `/api/proxy/customers/${EMAIL}/${REFRESH}/notes`;

  it('aucune valeur sensible : jeton, cookie, e-mail, empreinte', () => {
    const request = summarizeRequest(pathname, cookieHeader);
    logRefreshFailed(request, { status: 'expired', cause: 'rejected', backendStatus: 401, backendCode: 'token_not_valid' });
    logRefreshFailed(request, { status: 'expired', cause: 'rejected', backendStatus: 401, backendCode: REFRESH });
    logRefreshGraced(request);
    assert.equal(lines.length, 3);
    const output = lines.join('\n');
    for (const secret of [ACCESS, REFRESH, OTHER, EMAIL, 'youssef', tokenKey(ACCESS), tokenKey(REFRESH), tokenKey(OTHER), 'eyJ']) {
      assert.ok(!output.includes(secret), `valeur sensible dans le journal : ${secret.slice(0, 12)}…`);
    }
  });

  it('événements structurés : cause, statut, code, chemin, présence des cookies', () => {
    const request = summarizeRequest(pathname, cookieHeader);
    logRefreshFailed(request, { status: 'expired', cause: 'rejected', backendStatus: 401, backendCode: 'token_not_valid' });
    logRefreshGraced(summarizeRequest('/api/proxy/shop', `access_token=${ACCESS}`));
    const [failed, graced] = lines.map((line) => JSON.parse(line));
    assert.deepEqual(failed, {
      event: 'session_refresh_failed',
      cause: 'rejected',
      outcome: 'expired',
      backend_status: 401,
      backend_code: 'token_not_valid',
      path: '/api/proxy/customers/-/-/notes',
      access_cookie: true,
      refresh_cookie: true,
      access_cookie_duplicated: false,
      refresh_cookie_duplicated: true,
    });
    assert.deepEqual(graced, {
      event: 'session_refresh_graced',
      cause: 'grace_window',
      path: '/api/proxy/shop',
      access_cookie: true,
      refresh_cookie: false,
      access_cookie_duplicated: false,
      refresh_cookie_duplicated: false,
    });
  });
});
