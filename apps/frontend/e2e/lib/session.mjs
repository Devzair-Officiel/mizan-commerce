import { chromium } from 'playwright';
import { watchConsole } from './watch.mjs';

export const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.AUDIT_EMAIL ?? 'youssef@example.com';
const PASSWORD = process.env.AUDIT_PASSWORD ?? 'Mizan1234!';

export const VIEWPORTS = [
  { name: '1440', width: 1440, height: 1000, mobile: false },
  { name: '360', width: 360, height: 760, mobile: true },
];

/**
 * Chromium refuse `crypto.randomUUID` hors contexte sécurisé : l'origine du
 * frontend dans le réseau compose (http://frontend:3000) est déclarée sûre.
 */
export function launch() {
  return chromium.launch({ args: [`--unsafely-treat-insecure-origin-as-secure=${BASE}`] });
}

/**
 * Contexte connecté (une seule connexion par viewport : la limite 'auth' du
 * backend reste basse), console surveillée. Langue et thème se changent ensuite
 * avec `setLocale` / `setTheme`, pris en compte au prochain chargement de page.
 * Le thème vient du compte (`/auth/me/`) : la réponse est réécrite pour forcer
 * clair ou sombre sans toucher aux préférences enregistrées.
 */
export async function openSession(browser, viewport) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  });
  const setLocale = (locale) => ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  let theme = 'light';
  await setLocale('fr');
  await ctx.route(/\/api\/proxy\/auth\/me\/?(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const me = await response.json();
    await route.fulfill({ response, json: { ...me, theme_mode: theme } });
  });
  const page = await ctx.newPage();
  const watch = watchConsole(page);
  watch.setLabel(`${viewport.name} connexion`);
  await page.goto(`${BASE}/login`);
  await page.fill('#email', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login')),
    page.click('button[type=submit]'),
  ]);
  return { ctx, page, watch, setLocale, setTheme: (t) => { theme = t; } };
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
