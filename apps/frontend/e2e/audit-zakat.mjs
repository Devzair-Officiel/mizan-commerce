/**
 * Audit des erreurs de la zakat : plus aucune alert() — une notification à la place.
 * Un calcul finalisé est créé par l'API dans la boutique du compte d'audit ; la réouverture
 * (« Modifier ») est forcée en échec, l'erreur doit apparaître en notification, sans boîte
 * de dialogue du navigateur. Le calcul est supprimé à la fin (audit relançable).
 */
import { BASE, VIEWPORTS, createReport, inMatrix, launch, openSession } from './lib/session.mjs';
import { msg } from './lib/messages.mjs';

const report = createReport();
const FAILURE = 'Réouverture impossible (audit)';
const API = `${BASE}/api/proxy/zakat/calculations/`;

async function clearCalculations(page) {
  const data = await (await page.request.get(API)).json();
  for (const calc of Array.isArray(data) ? data : data.results) await page.request.delete(`${API}${calc.id}/`);
}

async function finalizedCalculation(page) {
  await clearCalculations(page);
  const draft = await (await page.request.post(API, { data: { reference_date: new Date().toISOString().slice(0, 10), cash_amount: '50000.00' } })).json();
  await page.request.post(`${API}${draft.id}/finalize/`);
  return draft.id;
}

const browser = await launch();
for (const viewport of VIEWPORTS) {
  const { ctx, page, watch, setLocale, setTheme } = await openSession(browser, viewport);
  const dialogs = [];
  page.on('dialog', (dialog) => { dialogs.push(dialog.message()); dialog.dismiss(); });
  await ctx.route(/\/api\/proxy\/zakat\/calculations\/[0-9a-f-]+\/reopen\/?$/, (route) =>
    route.fulfill({ status: 400, json: { detail: FAILURE } }));
  for (const locale of ['fr', 'ar']) {
    for (const theme of ['light', 'dark']) {
      if (!inMatrix(viewport, locale, theme)) continue;
      const label = `${viewport.name}px ${locale} ${theme === 'dark' ? 'sombre' : 'clair'}`;
      console.log(`\n=== ${label}`);
      await setLocale(locale);
      setTheme(theme);
      watch.setLabel(label);
      const before = watch.problems.length;
      const id = await finalizedCalculation(page);
      await page.goto(`${BASE}/zakat/${id}`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: msg(locale, 'zakat.detail.edit'), exact: true }).filter({ visible: true }).click();
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: FAILURE }).first();
      const shown = await toast.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      report.check(shown && dialogs.length === 0, `${label} : échec de la réouverture → notification, aucune alert()`);
      // Le 400 de la réouverture est provoqué par l'audit lui-même.
      const problems = watch.problems.slice(before).filter((p) => !/status of 400 .*\/reopen\//.test(p));
      report.check(problems.length === 0, `${label} : console propre${problems.map((p) => `\n      ${p}`).join('')}`);
    }
  }
  await clearCalculations(page);
  await ctx.close();
}
await browser.close();
report.finish();
