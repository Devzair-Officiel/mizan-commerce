import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { watchConsole } from './watch.mjs';
import { guardScroll } from './scroll.mjs';

export const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
/**
 * Comptes dédiés aux audits (seed) : chacun a sa propre « Boutique Audit », qui reçoit tout ce que
 * les audits créent. `run-audits.mjs` donne à chaque audit lancé en parallèle un emplacement
 * (`AUDIT_SLOT`) : 1 → e2e@example.com, 2 → e2e2@example.com… (`reset_audit_shop --slots`).
 */
const SLOT = Number(process.env.AUDIT_SLOT ?? 1);
const PREFIX = SLOT > 1 ? `e2e${SLOT}` : 'e2e';
export const EMAIL = process.env.AUDIT_EMAIL ?? `${PREFIX}@example.com`;
/** Employée de la boutique d'audit de l'emplacement. */
export const STAFF_EMAIL = `${PREFIX}-staff@example.com`;
/**
 * Boutique réservée à audit-invoices, hors emplacements : il y compte ses factures, et celles
 * qu'invoice-settings ou order-numbers émettent sur leur emplacement ne s'y mêlent pas.
 */
export const INVOICES_EMAIL = 'e2e-invoices@example.com';
/** Boutique réservée à audit-invoice-editor : ses brouillons et factures libres restent hors des comptes d'audit-invoices. */
export const INVOICE_EDITOR_EMAIL = 'e2e-invoice-editor@example.com';
export const PASSWORD = process.env.AUDIT_PASSWORD ?? 'Mizan1234!';

const ALL_VIEWPORTS = [
  { name: '1440', width: 1440, height: 1000, mobile: false },
  { name: '360', width: 360, height: 760, mobile: true },
];

/**
 * Configurations parcourues (`AUDIT_MATRIX`) : `smoke` (par défaut) en garde deux, `full` les huit
 * (deux tailles × fr/ar × clair/sombre).
 */
const MATRICES = {
  smoke: [['1440', 'fr', 'light'], ['360', 'ar', 'dark']],
  full: ALL_VIEWPORTS.flatMap(({ name }) => ['fr', 'ar'].flatMap((locale) => ['light', 'dark'].map((theme) => [name, locale, theme]))),
};
export const MATRIX = process.env.AUDIT_MATRIX || 'smoke';
const CONFIGS = MATRICES[MATRIX];
if (!CONFIGS) throw new Error(`AUDIT_MATRIX inconnue : ${MATRIX} (smoke ou full)`);

export const VIEWPORTS = ALL_VIEWPORTS.filter((v) => CONFIGS.some(([name]) => name === v.name));

/** Configuration à parcourir ? Sans `theme`, la langue suffit (audits qui ne changent pas de thème). */
export const inMatrix = (viewport, locale, theme) =>
  CONFIGS.some(([name, l, t]) => name === viewport.name && l === locale && (theme === undefined || t === theme));

/**
 * Sessions partagées entre les audits d'un même lancement (`AUDIT_STATE_DIR`, posé par `run-audits.mjs`) :
 * la limite 'auth' du backend (10 connexions par minute, toutes vues depuis le frontend) tient avec
 * plusieurs audits à la fois. Sans cette variable, chaque session se connecte.
 */
const STATE_DIR = process.env.AUDIT_STATE_DIR;
const stateFile = (email) => `${STATE_DIR}/${email}.json`;

async function savedState(email) {
  if (!STATE_DIR) return undefined;
  try {
    return JSON.parse(await readFile(stateFile(email), 'utf8'));
  } catch {
    return undefined;
  }
}

async function saveState(ctx, email) {
  if (!STATE_DIR) return;
  await mkdir(STATE_DIR, { recursive: true });
  const tmp = `${stateFile(email)}.${process.pid}`;
  await writeFile(tmp, JSON.stringify(await ctx.storageState()));
  await rename(tmp, stateFile(email));
}

/**
 * Chromium refuse `crypto.randomUUID` hors contexte sécurisé : l'origine du
 * frontend dans le réseau compose (http://frontend:3000) est déclarée sûre.
 * Le canal `chromium` (nouveau mode sans interface) est nécessaire : le
 * « headless shell » par défaut ignore ce drapeau.
 */
export function launch() {
  return chromium.launch({ channel: 'chromium', args: [`--unsafely-treat-insecure-origin-as-secure=${BASE}`] });
}

/**
 * Contexte connecté (une seule connexion par viewport, ou session partagée : la
 * limite 'auth' du backend reste basse), console surveillée, défilement contrôlé après chaque
 * interaction (scroll.mjs). Langue et thème se changent ensuite
 * avec `setLocale` / `setTheme`, pris en compte au prochain chargement de page.
 * Le thème vient du compte (`/auth/me/`) : la réponse est réécrite pour forcer
 * clair ou sombre (`setTheme`), et au besoin la couleur principale et le fond
 * (`setPalette({ primary_color, background_theme })`), sans toucher aux préférences enregistrées.
 * `email` : un autre compte de démo, en lecture (vérifier qu'une boutique est restée intacte).
 * `timezoneId` : fuseau de l'appareil (IANA), pour vérifier ce qui suit celui de la boutique.
 */
export async function openSession(browser, viewport, { email = EMAIL, timezoneId } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    timezoneId,
    storageState: await savedState(email),
  });
  const setLocale = (locale) => ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  let theme = 'light';
  let palette = {};
  await setLocale('fr');
  await ctx.route(/\/api\/proxy\/auth\/me\/?(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    try {
      const response = await route.fetch();
      const me = await response.json();
      await route.fulfill({ response, json: { ...me, theme_mode: theme, ...palette } });
    } catch {
      // Contexte fermé pendant la requête (fin d'audit) : plus personne ne l'attend.
    }
  });
  const page = await ctx.newPage();
  const watch = watchConsole(page);
  guardScroll(page, watch.add);
  watch.setLabel(`${viewport.name} connexion`);
  await page.goto(`${BASE}/login`);
  // Session partagée encore valide : /login renvoie vers l'application.
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.fill('#email', email);
    await page.fill('input[type=password]', PASSWORD);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login')),
      page.click('button[type=submit]'),
    ]);
    await saveState(ctx, email);
  }
  return { ctx, page, watch, setLocale, setTheme: (t) => { theme = t; }, setPalette: (p) => { palette = p; } };
}

/** Résultats d'audit : chaque vérification est affichée, les échecs comptés. */
export function createReport() {
  const failures = [];
  return {
    check(ok, label) {
      console.log(ok ? '  ✓' : '  ✗', label);
      if (!ok) failures.push(label);
    },
    finish() {
      console.log(failures.length ? `\nÉCHEC : ${failures.length} vérification(s)` : '\nTOUT EST CONFORME');
      process.exitCode = failures.length ? 1 : 0;
    },
  };
}
